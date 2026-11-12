import { fb } from "../firebase/config.js";
import { patient_details } from "./Dashboard-UI.js";


document.getElementById("loader").className = "loader";

const chartRegistry = new Map();
const DEFAULT_EWS_VALUE = "--";
const DEFAULT_EWS_COLOR = "0";
const PATIENT_ID_INDEX = 4;
const PATIENT_EWS_VALUE_INDEX = 5;
const PATIENT_EWS_COLOR_INDEX = 6;
const PATIENT_HR_INDEX = 7;
const PATIENT_BP_INDEX = 8;
const PATIENT_SPO2_INDEX = 9;
const PATIENT_TEMP_INDEX = 10;
const PATIENT_RR_INDEX = 11;
const PATIENT_ECG_INDEX = 12;
const PATIENT_ECG_TIMESTAMP_INDEX = 13;
const PATIENT_PPG_INDEX = 14;
const PATIENT_PPG_TIMESTAMP_INDEX = 15;
const PATIENT_RR_WAVE_INDEX = 16;
const PATIENT_RR_TIMESTAMP_INDEX = 17;

var doctor_id = localStorage.getItem("doctor_id");
var doctor_name = localStorage.getItem("docname");
var ref_doc_id = localStorage.getItem("doc_registerId");

var DoctorNameElement = document.getElementById("DoctorName");

if (DoctorNameElement && doctor_name) {
  DoctorNameElement.innerHTML = "Dr. " + doctor_name;
  firebase_Data_retrieval(ref_doc_id);
} else {
  console.warn('[dashboard-custom.js] Element with id "DoctorName" not found.');
}



function firebase_Data_retrieval(ref_doc_id) {

  var patient_list = fb.database().ref().child("patients");

  patient_list.on("value", async function (snapshot) {

    try {
      const patientPromises = [];

      snapshot.forEach((data) => {
        let patients_json = data.val();

        // if (patients_json.docId === ref_doc_id) {

          let id = patients_json.id.toString();

          const sessionRef = fb.database()
            .ref()
            // .child("session")
            .child("d_session")
            .child(id)
            .once("value")
            .then(snapshot => {

              let completeddate = "--";
              let completedtime = "--";
              // let dur = 0;
              let dur = "--"; // changed this to show -- when duration '0
              let statuslabel;
              let sessions = [];
              let latestCompletedUnix = 0;
              let startUnix = 0;
              let signal_qual = "--"
              let studyadequacy = "--"
              if (snapshot.exists()) {

                snapshot.forEach(childSnap => {
                  const session = childSnap.val();

                  // const completedUnix = session.spts;
                   // startUnix = session.stts;
                  const completedUnix = Number(session.spts);
                    startUnix = Number(session.stts);
                

                  if (completedUnix && startUnix) {

                    let completedTime = new Date(completedUnix * 1000);
                    let startTime = new Date(startUnix * 1000);

                    // let durationSec = session.total_duration_min;//(completedTime - startTime) / 1000;
                    // let hours = Math.floor(durationSec / 60);
                    // let minutestotal = Math.floor((durationSec % 60));
                    // let durationSec = (completedUnix - startUnix) / 60; // minutes, since spts/stts are in seconds
                    const recMin = Number(session.total_duration_min);
let durationSec =
  session.total_duration_min != null && session.total_duration_min !== "" && Number.isFinite(recMin)
    ? recMin                                   // same source as the report
    : (completedUnix - startUnix) / 60;        // fallback if the field is missing
    
                    let hours = Math.floor(durationSec / 60);
                    let minutestotal = Math.floor((durationSec % 60));
                    
                    statuslabel = session.status;
                    let sessionDuration = hours + "h " + minutestotal + "min";
                    //let sessionDuration = (hours === 0 && minutestotal === 0) ? "--" : hours + "h " + minutestotal + "min"; 
                    signal_qual = session.signal_quality;
                    studyadequacy = session.study_adequacy;

                    let sessionDateTime =
                      ("0" + startTime.getDate()).slice(-2) + "/" +
                      ("0" + (startTime.getMonth() + 1)).slice(-2) + "/" +
                      startTime.getFullYear() + " " +
                      ("0" + startTime.getHours()).slice(-2) + ":" +
                      ("0" + startTime.getMinutes()).slice(-2) + ":" +
                      ("0" + startTime.getSeconds()).slice(-2);

                    sessions.push({
                      timestamp: startUnix,
                      dateTime: sessionDateTime,
                      duration: sessionDuration
                    });

                    console.log("session", sessions, "id" + id);
                    console.log('session raw:', session);
                    // Keep track of latest session
                    if (completedUnix > latestCompletedUnix) {
                      latestCompletedUnix = completedUnix;

                      completeddate =
                        ("0" + completedTime.getDate()).slice(-2) + "/" +
                        ("0" + (completedTime.getMonth() + 1)).slice(-2) + "/" +
                        completedTime.getFullYear();

                      completedtime =
                        ("0" + completedTime.getHours()).slice(-2) + ":" +
                        ("0" + completedTime.getMinutes()).slice(-2) + ":" +
                        ("0" + completedTime.getSeconds()).slice(-2);

                      dur = sessionDuration;

                    
                    }
                  }
                });

                // Optional: newest session first in UI
                sessions.sort((a, b) => b.timestamp - a.timestamp);
              }

              return [
                patients_json.username,
                patients_json.age,
                patients_json.gender,
                completeddate,
                completedtime,
                id,
                startUnix,
                dur,
                statuslabel,
                signal_qual,
                studyadequacy
                // sessions // <-- added at the end
              ];
            });

          patientPromises.push(sessionRef);
        // }
      });


      const patient_info = await Promise.all(patientPromises);
      console.log("FINAL patient_info:", patient_info.length);
      patient_details(patient_info);

    } catch (e) {
      console.error(e);
    }

  });
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('session-link')) {
    const timestamp = e.target.dataset.timestamp;
    console.log('Selected timestamp:', timestamp);
  }
});

