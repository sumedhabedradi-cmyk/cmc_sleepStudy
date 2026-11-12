importScripts("https://www.gstatic.com/firebasejs/8.6.2/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.6.2/firebase-messaging.js");
// Note: This service worker is registered as a classic script, so ES module
// imports are not supported here. Firebase is initialized separately in this
// worker; we do not import the browser config module.
const firebaseConfig = {
  apiKey: "AIzaSyCS4G59zuvoFjj6jz1ZjMXTzgmIDt8EbvY",
  authDomain: "cmc-pediatric-2.firebaseapp.com",
  databaseURL: "https://cmc-pediatric-2-default-rtdb.firebaseio.com",
  projectId: "cmc-pediatric-2",
  storageBucket: "cmc-pediatric-2.firebasestorage.app",
  messagingSenderId: "300469028488",
  appId: "1:300469028488:web:96beb9c6d5820199b7413d",
  measurementId: "G-NVV1X0B5PL"
};
const fb = firebase.initializeApp(firebaseConfig);

try {
  const messaging = fb.messaging();
  console.log("notification [firebase-messaging-sw.js] loaded firebase-messaging-sw.js");

  /****************************************** showNotification-STARTS *************************************/
  messaging.setBackgroundMessageHandler(function (payload) {
    console.log("notification [firebase-messaging-sw.js] payload", payload);
    let calltype = payload?.data?.info;

    var Notificatoinbody;
    var notificatoinType;
    var actionType;
    if (calltype == "call") {
      console.trace("notification [firebase-messaging-sw.js] calltype", calltype);
      notificatoinType = "incoming call";
      let caller_info = JSON.parse(payload.data.call_info);
      Notificatoinbody = "From: " + caller_info.name;
    } else if (calltype == "context") {
      console.log("notification [firebase-messaging-sw.js] calltype", calltype);
      notificatoinType = " New Context Assessment";
      let username = payload?.data?.uname;
      let symptom = payload?.data?.symptom;
      let scale = payload?.data?.scale;
      Notificatoinbody = ContextPatientSymptomsRawConversion(username, symptom, scale);
    } else if (calltype == "Threshold Breach") {
      console.log("notification [firebase-messaging-sw.js] calltype", calltype);
      notificatoinType = payload?.data?.title;
      Notificatoinbody = payload?.data?.body;
    }

    const notificationTitle = "Svasthya: " + notificatoinType;
    const notificationOptions = {
      body: Notificatoinbody,
      icon: new URL("../production/images/login_icon.png", self.location.origin).href,
      badge: new URL("../production/images/login_icon.png", self.location.origin).href,
      requireInteraction: true,
      data: payload,
      actions: actionType,
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });

  /****************************************** showNotification-ENDS *************************************/

  /*********************************** Onclick Notification *******************************/
  addEventListener("notificationclick", (event) => {
    let payload = event?.notification?.data;
    let calltype = payload?.data?.info;
    if (calltype == "call") {
      let payload = event?.notification?.data;
      let caller_info = payload?.data?.call_info;
      let u_info = payload?.data?.u_info;

      const channeId = btoa(caller_info.channel_id);
      const uid = btoa(caller_info.from);
      const name = btoa(u_info.username);
      console.log("context_info", caller_info.channel_id);
      const url = "svasthya/production/index.html?openpage=backgroundnotification" + "&channelid=" + channeId + "&uid=" + uid + "&name=" + name;

      event.waitUntil(
        (async () => {
          const allClients = await clients.matchAll({
            includeUncontrolled: true,
          });

          let chatClient;

          // Let's see if we already have a chat window open:
          for (const client of allClients) {
            const url = new URL(client.url);
            console.log("URL Path Name: ", url.pathname);
            if (url.pathname === "http://localhost:5000/production/index.html" || "http://localhost:5000/production/dashboard.html") {
              // Excellent, let's use it!
              client.focus();
              chatClient = client;
            }
          }

          // If we didn't find an existing chat window,
          // open a new one:
          if (!chatClient) {
            chatClient = await clients.openWindow(url);
          }

          // Message the client:
          chatClient.postMessage({
            msg: "New message",
            url: url,
          });
        })(),
      );
    } else if (calltype == "context") {
      // let notificationPayload = event.notification.data;
      // console.log("notification [firebase-messaging-sw.js] calltype", calltype, " notificationPayload", notificationPayload);
      // let timestamp = notificationPayload.data.timestamp;
      // var uuid = notificationPayload.data.uid;

      // const param1 = btoa(timestamp);
      // const param2 = btoa(uuid);
      // const param3 = btoa("1");
      // const url = "svasthya/production/index.html?openpage=backgroundnotification" + "&param1=" + param1 + "&param2=" + param2 + "&param3=" + param3;

      const targetUrl = "https://svasthyahealth.com/svasthya_playstore_resp/production/dashboard.html";
      event.waitUntil(clients.openWindow(targetUrl));
    } else if (calltype == "Threshold Breach") {
      const targetUrl = "https://svasthyahealth.com/svasthya_playstore_resp/production/dashboard.html";
      event.waitUntil(clients.openWindow(targetUrl));
    }
  });
  /*********************************** Onclick Notification Ends *******************************/

  function ContextPatientSymptomsRawConversion(PatientName, RawSymptoms, RawScale) {
    console.log("RawSymptoms", RawSymptoms);
    console.log("RawScale", RawScale);

    if (!RawSymptoms) {
      return PatientName + " has no reported symptoms";
    }

    RawSymptoms = RawSymptoms.trim();
    RawScale = (RawScale || "").trim();

    const symptomSeparator = ":";
    const scaleSeparator = ":";
    let symptoms = RawSymptoms.split(symptomSeparator)
      .map(function (s) {
        return s.trim();
      })
      .filter(function (s) {
        return s.length > 0;
      });

    // Remove trailing '|' at the last and split the scale values.
    // example "0:0:0:0:0:8|"
    let scale = RawScale.replace(/\|/g, "")
      .split(scaleSeparator)
      .filter(function (v) {
        return v !== "";
      })
      .map(function (v) {
        return parseInt(v, 10);
      });

    console.log("notification [firebase-messaging-sw.js] scale", scale);
    console.log("notification [firebase-messaging-sw.js] symptoms", symptoms);
    let sequel = [];
    for (let i = 0; i < symptoms.length; i++) {
      let level = scale[i];
      let symptomText = symptoms[i];

      if (isNaN(level) || level === 0) {
        sequel.push(symptomText);
      } else if (level >= 1 && level <= 3) {
        sequel.push("Mild " + symptomText);
      } else if (level >= 4 && level <= 6) {
        sequel.push("Moderate " + symptomText);
      } else if (level >= 7 && level <= 10) {
        sequel.push("Severe " + symptomText);
      } else {
        sequel.push(symptomText);
      }
    }

    let SymptomsMerged = sequel.join(", ");
    return PatientName + " has " + SymptomsMerged;
  }
} catch (e) {
  console.error("notification [firebase-messaging-sw.js] Error loading firebase scripts:", e);
}
