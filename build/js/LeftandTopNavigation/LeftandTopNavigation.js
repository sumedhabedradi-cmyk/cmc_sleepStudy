import { fb } from "../firebase/config.js";
import { getAllParameters } from "../livepage/database_function.js";


var patientname;
var gender;
var age;
var height;
var weight;
var ailment;
var email;
var gender;
var mobile;
var completedTime;
var duration;


if (localStorage.getItem("doctor_id") == undefined) {
  location.replace("login.html");
}

try {
  document.getElementById("logout").addEventListener("click", logout);
} catch (e) {
  console.error("In HTML ID: Login is not found", e);
}

// Toggle profile dropdown (logout menu) when profile avatar is clicked
try {
  const profileToggle = document.getElementById("profileToggle");
  const profileMenu = document.getElementById("profileMenu");

  if (profileToggle && profileMenu) {
    profileToggle.addEventListener("click", function (event) {
      event.stopPropagation();
      profileMenu.style.display = profileMenu.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", function () {
      profileMenu.style.display = "none";
    });
  }
} catch (e) {
  console.error("Unable to attach profile dropdown handlers", e);
}

function logout() {
  // Get the current user's FCM token
  try {
    const messaging = fb.messaging();
    messaging
      .getToken()
      .then((currentToken) => {
        if (currentToken) {
          // Delete the user's FCM token
          messaging
            .deleteToken(currentToken)
            .then(() => {
              console.log("FCM token deleted.");
            })
            .catch((error) => {
              console.error("Error deleting FCM token.", error);
            });
        } else {
          console.log("No Instance ID token available. Unable to delete FCM token.");
        }
      })
      .catch((error) => {
        console.error("An error occurred while retrieving token. Unable to delete FCM token.", error);
      });
  } catch (e) {
    console.error("In HTML ID: Login is not found", e);
  }

  // Remove the user's data from local storage
  localStorage.removeItem("patient_unique_id");
  localStorage.removeItem("doctor_id");
  localStorage.removeItem("docname");

  // Redirect the user to the login page or home page
  window.location.href = "login.html"; // Change "login.html" to the appropriate URL
}

const id = localStorage.getItem("patient_unique_id");
if (id) {
  const allSessions = [];
  let completedDateTime = "--";
  let durationText = "--";
  let durationText1 = "--";

    // const sessionRef = fb.database().ref().child("session").child(id);
  const sessionRef = fb.database().ref().child("d_session").child(id);
  sessionRef.once("value", function (snap) {
    if (snap.exists()) {
      snap.forEach((childSnap) => {

  // let completedDateTime = "--"; 
  // let durationText = "--";
  // let durationText1 = "--";

        const key = childSnap.key; // timestamp node
        const session = childSnap.val();
        if (session.spts) {
          const dt = new Date(session.spts * 1000);
          completedDateTime =
            ("0" + dt.getDate()).slice(-2) + "/" +
            ("0" + (dt.getMonth() + 1)).slice(-2) + "/" +
            dt.getFullYear() + " " +
            ("0" + dt.getHours()).slice(-2) + ":" +
            ("0" + dt.getMinutes()).slice(-2) + ":" +
            ("0" + dt.getSeconds()).slice(-2);
        }

        if (session.stts && session.spts) {
          const duration = session.spts - session.stts;
          const duration1 = session.total_duration_min//session.spts - session.stts;
          const hours = Math.floor(duration / 3600);
          const minutes = Math.floor((duration % 3600) / 60);
          const hrs = Math.floor(duration1/60);
          const min = Math.floor((duration1 % 60));
          
          durationText = `${hours}h ${minutes}min`;
          // durationText1 = `${hrs}h ${min}min`;
          // durationText1 = `${hours}h ${minutes}min`;
          //to show duration same as there in report
          durationText1 = (duration1 != null && !isNaN(duration1))
            ? `${hrs}h ${min}min`            // same source as the report
            : `${hours}h ${minutes}min`;  // fallback if the field is missing
        }
        // to show latest session at last
        // allSessions.push({
        //   sessionId: key,
        //   dateTime: completedDateTime,
        //   duration: durationText,
        //   duration1:durationText1
        // });

        //to show latest session first
        allSessions.push({
          sessionId: key,
          timestamp: Number(session.spts) || 0,
          dateTime: completedDateTime,
          duration: durationText,
          duration1:durationText1
        });


        console.log(allSessions);
        const latestSession = allSessions.sort(
          (a, b) => b.timestamp - a.timestamp
        )[0];

        console.log("latest session", latestSession)
        if (document.getElementById("CompletedSession")) document.getElementById("CompletedSession").innerHTML = "Date and Time of Last Completed Session: " + completedDateTime;
        if (document.getElementById("Duration")) document.getElementById("Duration").innerHTML = "Duration: " + durationText1;
        const el = document.getElementById("SessionsList");

        if (el) {
          el.innerHTML = allSessions
            .map(s => `
            <li>
               <a class="session-link" data-ts="${s.sessionId}">
                    ${s.dateTime} - ${s.duration1}
                </a>
            </li>
        `)
            .join("");
        }

      });

      const firstSession = document.querySelector("#SessionsList .session-link");
      if (firstSession) {
        firstSession.classList.add("active");
        getAllParameters(firstSession.dataset.ts);
      }
    }
  })
document.addEventListener("click", function (e) {
  const el = e.target.closest(".session-link");
  if (!el) return;

  // highlight
  document.querySelectorAll(".session-link")
    .forEach(x => x.classList.remove("active"));

  el.classList.add("active");

  // fetch data
  console.log("datet", el.dataset.ts);
  getAllParameters(el.dataset.ts);
});


  // const session = fb.database().ref().child("session").child(id).orderByKey().limitToLast(1);
  // session.once("value",function(snapshot) {
  //     if(snapshot.exists()){
  //     let session_data = snapshot.val();
  //     let session = Object.values(session_data)[0];
  //     console.log("session",session.spts , session.stts);
  //     completedTime = session.spts = ""?completedTime = "--": completedTime = session.spts;

  //     duration = (session.spts - session.stts);

  //     let hours = Math.floor(duration / 3600);
  //     let minutestotal = Math.floor((duration % 3600) / 60);
  //     duration = hours +"h " +" " + minutestotal + "min"; 

  //     completedTime = new Date(completedTime *1000);
  //     var completeddate = ("0" + completedTime.getDate()).slice(-2) + "/" + ("0" + (completedTime.getMonth() + 1)).slice(-2) + "/" + completedTime.getFullYear();
  //     var completedtime = ("0" + completedTime.getHours()).slice(-2) + ":" + ("0" + completedTime.getMinutes()).slice(-2) + ":" + ("0" + completedTime.getSeconds()).slice(-2);

  //     if (document.getElementById("CompletedSession")) document.getElementById("CompletedSession").innerHTML = "Date and Time of Last Completed Session: " + completeddate + " " + completedtime;
  //     if (document.getElementById("Duration")) document.getElementById("Duration").innerHTML = "Duration: " + duration;
  //   }
  // })
  const patients = fb.database().ref().child("patients").child(id);
  patients.once("value", function (snapshot) {
    if (snapshot.exists()) {
      let patient_data1 = snapshot.val();
      patientname = patient_data1.username;

      gender = patient_data1.gender == "" ? (gender = "--") : (gender = patient_data1.gender);
      if (patient_data1.gender == "F") {
        if (document.getElementById("PatientImg") != null) {
          document.getElementById("PatientImg").src = new URL("../../../production/images/Female.jpg", import.meta.url).href;
        }
      } else {
        if (document.getElementById("PatientImg") != null) {
          document.getElementById("PatientImg").src = new URL("../../../production/images/Male.jpg", import.meta.url).href;
        }
      }

      age = patient_data1.age == "" ? (age = "--") : (age = patient_data1.age);
      height = patient_data1.height == "" ? (height = "--") : (height = patient_data1.height);
      weight = patient_data1.weight == "" ? (weight = "--") : (weight = patient_data1.weight);
      ailment = patient_data1.ailment == "" ? (ailment = "--") : (ailment = patient_data1.ailment);
      email = patient_data1.email == "" ? (email = "--") : (email = patient_data1.email);
      gender = patient_data1.gender == "" ? (gender = "--") : ((gender = patient_data1.gender) === "F") ? (gender = "Female") : (gender == "M") ? (gender = "Male") : (gender = "--"); // added both condition to show gender properly in live page
      mobile = patient_data1.mobile == "" ? (mobile = "--") : (mobile = patient_data1.mobile);
      try {
        if (document.getElementById("PatientName")) document.getElementById("PatientName").innerHTML = "Name: " + patientname;
        if (document.getElementById("PatientGender")) document.getElementById("PatientGender").innerHTML = "Gender: " + gender;
        if (document.getElementById("PatientAge")) document.getElementById("PatientAge").innerHTML = "Age: " + age + "Years";

      } catch (e) {
        console.error("Unable to set innerHTML", e);
      }
    }
  });



}
