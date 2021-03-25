// create Agora client
var client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
var clientRtm = null;

var localTracks = {
  videoTrack: null,
  audioTrack: null
};
var remoteUsers = {};
// Agora client options
var options = {
  appid: null,
  channel: null,
  uid: null,
  token: null,
  remoteuid:null
};

var rtc = {
  clientRtm: null,
  channelRtm: null
};


// the demo can auto join channel with params in url
$(() => {
  var urlParams = new URL(location.href).searchParams;
  options.appid = urlParams.get("appid");
  options.channel = urlParams.get("channel");
  options.token = urlParams.get("token");
  if (options.appid && options.channel) {
    $("#appid").val(options.appid);
    $("#token").val(options.token);
    $("#channel").val(options.channel);
    $("#join-form").submit();
  }
})

$("#join-form").submit(async function (e) {
  e.preventDefault();
  $("#join").attr("disabled", true);
  try {
    options.appid = $("#appid").val();
    options.token = $("#token").val();
    options.channel = $("#channel").val();
    await join();
    await joinRtm();
    if(options.token) {
      $("#success-alert-with-token").css("display", "block");
    } else {
      $("#success-alert a").attr("href", `index.html?appid=${options.appid}&channel=${options.channel}&token=${options.token}`);
      $("#success-alert").css("display", "block");
    }
  } catch (error) {
    console.error(error);
  } finally {
    $("#leave").attr("disabled", false);
  }
})

//$("#leave-form").submit(async function (e) {
//    options.remoteuid = $("#targetUid").val();
//    leaveOfremote();
//})


$("#leave").click(function (e) {
  leave();
  logoutRtm();
})

$("#leaveOfremote").click(function (e) {
  console.log("leaveOfremote");
  options.remoteuid = $("#targetUid").val();
  console.log(options.remoteuid);
  leaveOfremote();
})


async function join() {

  // add event listener to play remote tracks when remote user publishs.
  client.on("user-published", handleUserPublished);
  client.on("user-unpublished", handleUserUnpublished);

  // join a channel and create local tracks, we can use Promise.all to run them concurrently
  [ options.uid, localTracks.audioTrack, localTracks.videoTrack ] = await Promise.all([
    // join the channel
    client.join(options.appid, options.channel, options.token || null),
    // create local tracks, using microphone and camera
    AgoraRTC.createMicrophoneAudioTrack(),
    AgoraRTC.createCameraVideoTrack()
  ]);
  
  // play local video track
  localTracks.videoTrack.play("local-player");
  $("#local-player-name").text(`localVideo(${options.uid})`);

  // publish local tracks to channel
  await client.publish(Object.values(localTracks));
  console.log("publish success");
}

async function leave() {
  for (trackName in localTracks) {
    var track = localTracks[trackName];
    if(track) {
      track.stop();
      track.close();
      localTracks[trackName] = undefined;
    }
  }

  // remove remote users and player views
  remoteUsers = {};
  $("#remote-playerlist").html("");

  // leave the channel
  await client.leave();

  $("#local-player-name").text("");
  $("#join").attr("disabled", false);
  $("#leave").attr("disabled", true);
  console.log("client leaves channel success");
}

async function subscribe(user, mediaType) {
  const uid = user.uid;
  // subscribe to a remote user
  await client.subscribe(user, mediaType);
  console.log("subscribe success");
  if (mediaType === 'video') {
    const player = $(`
      <div id="player-wrapper-${uid}">
        <p class="player-name">remoteUser(${uid})</p>
        <div id="player-${uid}" class="player"></div>
      </div>
    `);
    $("#remote-playerlist").append(player);
    user.videoTrack.play(`player-${uid}`);
  }
  if (mediaType === 'audio') {
    user.audioTrack.play();
  }
  add(uid);
}

function handleUserPublished(user, mediaType) {
  const id = user.uid;
  remoteUsers[id] = user;
  subscribe(user, mediaType);
}

function handleUserUnpublished(user) {
  const id = user.uid;
  delete remoteUsers[id];
  $(`#player-wrapper-${id}`).remove();
  remove(id);
}

function connectionStateChange(newState, reason) {
  console.log("on connection state changed to " + newState + " reason:" + reason);
}

//joinRtm
function joinRtm () {
  //Create an Instance and Channel
  rtc.clientRtm = AgoraRTM.createInstance(options.appid);
  rtc.channelRtm = rtc.clientRtm.createChannel(options.channel);

  //Set a listener to the connection state change
  rtc.clientRtm.on("ConnectionStateChange", function (newState, reason) {
console.log("on connection state changed to " + newState + " reason:" + reason);
  });
  //Log in the Agora RTM system
  rtc.clientRtm.login({token: null, uid: "" + options.uid}).then(function(){
    console.log("AgoraRTM client login success");
    rtc.channelRtm.join().then(function(){
      console.log("AgoraRTM client join success");
      receiveChannelMessage();
    }).catch(function (err){
      console.log("AgoraRTM client join failure, ", err);
    });

  }).catch(function(err){
    console.log("AgoraRTM client login failure, ", err);
  });
}

//logoutRtm
function logoutRtm(){
  rtc.clientRtm.logout(function(){
    console.log("AgoraRTM client logout success");
  });

}

function add (id) {
  console.log("add: " + id);
  $('<option/>', {
   value: id,
   text: id,
  }).appendTo("#targetUid");
}

function remove (id) {
  console.log("remove: " + id);
  $('select#targetUid option[value=' + id + ']').remove();
}

function leaveOfremote () {
  sendChannelMessage(prepMessage("leave",options.remoteuid));
}

function prepMessage(msg,id){
  console.log(id + ":" + msg);
  return id + ":" + msg;
}

function sendChannelMessage(localMessage){
  rtc.channelRtm.sendMessage({text:localMessage}).then(function(){
    console.log("AgoraRTM client succeed in sending channel message: " + localMessage);
  }).catch(function(err){
    console.log("AgoraRTM client failed to sending role" + err);
  });
}


function receiveChannelMessage(){
 
  rtc.channelRtm.on("ChannelMessage", function (sentMessage, senderId) {
    console.log("AgoraRTM client got message: " + JSON.stringify(sentMessage) + " from " + senderId);

    console.log(sentMessage.text == options.uid + ":leave");
    if (sentMessage.text == options.uid + ":leave"){
      leave();
      logoutRtm();
    }

  });
}


