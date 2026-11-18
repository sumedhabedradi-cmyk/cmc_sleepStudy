import { createVitalChart } from "./live-custom.js";
import { fb } from "../firebase/config.js";
import { NoEcgData, NoData, NoPpgData, NoRRData } from "./EchartGraphs.js";
import { installGlobalEchartsAutoResize } from "../utils/echarts-auto-resize.js";
// import { showNoData,createTimeWindows ,createWindowTabs ,setManualTrimSaveHandler, setAutoTrimSaveHandler, setTrimRestoreHandler, setTrimChangeHandler } from "./live-custom.js";
import { showNoData, createTimeWindows, createWindowTabs, setManualTrimSaveHandler,
         setAutoTrimSaveHandler, setTrimRestoreHandler, setTrimChangeHandler,
         setFileHandlers, refreshFilesDropdown } from "./live-custom.js";
installGlobalEchartsAutoResize();

// [{start,end}] (ms), "s1,e1,s2,e2" (seconds)
function formatRanges(gaps) {
   const arr = [];
    gaps.forEach(g => {
        arr.push(Math.floor(g.start / 1000));
        arr.push(Math.floor(g.end / 1000));
    });
    return arr;
}
// compare by key, because Firebase returns keys in a different order
const sameData = (a, b) => {
    const k = o => Object.keys(o || {}).sort().map(x => x + ":" + JSON.stringify(o[x])).join("|");
    return k(a) === k(b);
};
// session_trim/{UUID}/{docId}/{session start ts}/manual_trim/{chartKey}/[0..n]
// async function saveManualTrim(gapsByChart) {
async function saveManualTrim(gapsByChart, clearFirst = false) {
    const uuid = localStorage.getItem("patient_unique_id");
    const docId = localStorage.getItem("doc_registerId");
    const sessionStart = localStorage.getItem("starttime");

    if (!uuid || !docId || !sessionStart || sessionStart === "--") {
        console.warn("MANUAL TRIM: missing uuid / docId / session start, not saved");
        return;
    }
    const payload = {};
    Object.entries(gapsByChart).forEach(([chartKey, gaps]) => {
        const values = formatRanges(gaps);   // [s1, e1, s2, e2, ...] in seconds

        if (values.length === 0 || values.length % 2 !== 0) {
            console.error(`MANUAL TRIM: ${chartKey}.length is ${values.length}, must be even and not empty. Skipped.`);
            return;
        }
        payload[chartKey] = values;          // array
    });

    if (Object.keys(payload).length === 0) return;

    // try {
    //     await fb.database().ref()
    //         .child("session_trim")
    //         .child(uuid)
    //         .child(docId)
    //         .child(sessionStart)
    //         .child("manual_trim")
    //         .set(payload);                   // ONE write
    //     console.log("MANUAL TRIM SAVED:", uuid, docId, sessionStart, payload);
    // } catch (err) {
    //     console.error("MANUAL TRIM SAVE FAILED:", err);
    // }
        try {

        const base = fb.database().ref()
            .child("session_trim")
            .child(uuid)
            .child(docId)
            .child(sessionStart);
          if (!clearFirst) {
    const old = (await base.child("manual_trim").once("value")).val();
    if (sameData(old, payload)) { console.log("MANUAL TRIM: unchanged"); stopWaiting(); return; }
}
        if (clearFirst) await base.remove();          // default mode: wipe auto + manual first
        await base.child("manual_trim").set(payload); // ONE write
        console.log("MANUAL TRIM SAVED:", uuid, docId, sessionStart, payload);
    } catch (err) {
        console.error("MANUAL TRIM SAVE FAILED:", err);
    }
}

// register the hook so other files can call it
setManualTrimSaveHandler(saveManualTrim);

// session_trim/{UUID}/{docId}/{session start ts}/auto_trim/spo/[0..n]
// async function saveAutoTrim(gaps) {
async function saveAutoTrim(gaps, clearFirst = false) {
    const uuid = localStorage.getItem("patient_unique_id");
    const docId = localStorage.getItem("doc_registerId");
    const sessionStart = localStorage.getItem("starttime"); // seconds

    if (!uuid || !docId || !sessionStart || sessionStart === "--") {
        console.warn("AUTO TRIM: missing uuid / docId / session start, not saved");
        return;
    }

    const ref = fb.database().ref()
        .child("session_trim")
        .child(uuid)
        .child(docId)
        .child(sessionStart)
        .child("auto_trim");

    try {
        // default mode + new auto trim: wipe the old auto + manual node first
        if (clearFirst && gaps && gaps.length) await ref.parent.remove();

        // toggle OFF, or no gaps found: remove the node only if it exists
        if (!gaps || gaps.length === 0) {
            const had = (await ref.once("value")).exists();
            if (had) { 
              await ref.remove(); 
              console.log("AUTO TRIM REMOVED");
            }
            else { stopWaiting(); }   // no DB event will fire, so release the loader
            return;
        }
        const values = formatRanges(gaps);   // [s1, e1, s2, e2, ...] in seconds

        if (values.length === 0 || values.length % 2 !== 0) {
            console.error(`AUTO TRIM: spo.length is ${values.length}, must be even and not empty. Not saved.`);
            return;
        }
      if (!clearFirst) {
        const old = (await ref.child("spo").once("value")).val();
        if (JSON.stringify(old) === JSON.stringify(values)) {
          console.log("AUTO TRIM: unchanged");
          stopWaiting();
          return;
        }
      }
        await ref.child("spo").set(values);  // array
        console.log("AUTO TRIM SAVED:", uuid, docId, sessionStart, values);
    } catch (err) {
        console.error("AUTO TRIM SAVE FAILED:", err);
    }
}
// register the hook
setAutoTrimSaveHandler(saveAutoTrim);

// session_trim/{UUID}/{docId}/{session start ts}
function getTrimBaseRef() {
    const uuid = localStorage.getItem("patient_unique_id");
    const docId = localStorage.getItem("doc_registerId");
    const sessionStart = localStorage.getItem("starttime");

    if (!uuid || !docId || !sessionStart || sessionStart === "--") {
        console.warn("TRIM: missing uuid / docId / session start");
        return null;
    }
    return fb.database().ref()
        .child("session_trim").child(uuid).child(docId).child(sessionStart);
}

function parseRanges(raw) {
    let nums;
    if (Array.isArray(raw)) {
        nums = raw;
    } else if (raw && typeof raw === "object") {
        nums = Object.values(raw);           // Firebase can return an object if indexes are sparse
    } else {
        nums = String(raw).split(",");       // old string format
    }

    nums = nums.map(Number).filter(Number.isFinite);

    const gaps = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
        gaps.push({ start: nums[i] * 1000, end: nums[i + 1] * 1000 });
    }
    return gaps;
}

// RESET: remove auto + manual trim of this session from session_trim node in db
// async function resetTrimInDb() {
//     const base = getTrimBaseRef();
//     if (!base) throw new Error("Cannot reset trim: session identifiers are unavailable");
//     try {
//         await base.remove();
//         console.log("TRIM RESET: auto + manual removed");
//     } catch (err) {
//         console.error("TRIM RESET FAILED:", err);
//         throw err;
//     }
// }
// setTrimResetHandler(resetTrimInDb);

// LOAD saved trim when the page opens
async function loadSavedTrim() {
    const base = getTrimBaseRef();
    if (!base) return null;
    try {
        const snap = await base.once("value");
        const val = snap.exists() ? snap.val() : {};

        const manual = {};
        Object.entries(val.manual_trim || {}).forEach(([key, str]) => {
            manual[key] = parseRanges(str);
        });
        return { hasAuto: !!val.auto_trim, manual };
    } catch (err) {
        console.error("TRIM LOAD FAILED:", err);
        return null;   // on error, live-custom.js keeps its local state
    }
}
async function loadLatestTrim() {
    const uuid = localStorage.getItem("patient_unique_id");
    const docId = localStorage.getItem("doc_registerId");
    if (!uuid || !docId) return null;

    try {
        const snap = await fb.database().ref()
            .child("session_trim").child(uuid).child(docId)
            .orderByKey().limitToLast(1)
            .once("value");
        if (!snap.exists()) return null;

        let val = {};
        snap.forEach(child => { val = child.val() || {}; });

        const manual = {};
        Object.entries(val.manual_trim || {}).forEach(([key, str]) => {
            manual[key] = parseRanges(str);
        });
        return { hasAuto: !!val.auto_trim, manual };
    } catch (err) {
        console.error("LATEST TRIM LOAD FAILED:", err);
        return null;
    }
}

setTrimRestoreHandler(loadLatestTrim);

// ---------- Saved files (svdby) ----------
let latestAnalysis = null;   // last report painted

// TODO: point this at wherever you store the logged-in doctor's name
function getDoctorName() {
    return localStorage.getItem("docname") || "Unknown";
}

// svdby/{patientId}/{sessionTimestamp}/{fileId}
// function getSavedFilesRef() {
//     return fb.database().ref().child("svdby").child(id).child(timestamp);
// }

// async function saveCurrentAnalysis(fileName) {
//     if (waiting) throw new Error("REPORT_PENDING");
//     if (!latestAnalysis) throw new Error("NO_REPORT");
//     const base = getTrimBaseRef();
//     if (!base) throw new Error("NO_SESSION");

//     const [trimSnap, sessSnap] = await Promise.all([
//         base.once("value"),
//         fb.database().ref().child("session").child(id).child(timestamp).once("value")
//     ]);
//     const trim = trimSnap.val() || {};

//     const record = {
//         file_name: fileName,
//         doctor_name: getDoctorName(),
//         doctor_id: localStorage.getItem("doc_registerId") || null,
//         saved_ts: Math.floor(Date.now() / 1000),
//         session: sessSnap.val() || {},
//         session_analysis: latestAnalysis,
//         auto_trim_ts: (trim.auto_trim && trim.auto_trim.spo) || null,
//         manual_trim_ts: trim.manual_trim || null
//     };
//     const ref = getSavedFilesRef().push();
//     await ref.set(record);
//     return ref.key;
// }

// async function listSavedFiles() {
//     const snap = await getSavedFilesRef().once("value");
//     const out = [];
//     snap.forEach(c => {
//         const v = c.val() || {};
//         out.push({ id: c.key, file_name: v.file_name, doctor_name: v.doctor_name, saved_ts: v.saved_ts || 0 });
//     });
//     return out.sort((a, b) => b.saved_ts - a.saved_ts);
// }

// async function loadSavedFile(fileId) {
//     const v = (await getSavedFilesRef().child(fileId).once("value")).val();
//     if (!v) return null;
//     const manual = {};
//     Object.entries(v.manual_trim_ts || {}).forEach(([k, r]) => { manual[k] = parseRanges(r); });
//     return { trim: { hasAuto: !!v.auto_trim_ts, manual }, analysis: v.session_analysis || null };
// }

// ---------- Saved files: svdby/{uid}/{report name}/{session timestamp} ----------
const safeKey = n => String(n).trim().replace(/[.$#\[\]\/]/g, "_");

function getReportsRoot() {
    return fb.database().ref().child("svdby").child(id);
}

// fields copied from the session node, then from session_analysis
const SESSION_FIELDS = ["stts", "spts", "status", "report_url", "dvrf"];
const ANALYSIS_FIELDS = [
    "signal_quality", "study_adequacy", "total_duration_min", "mean_SpO2", "baseline_SpO2",
    "min_SpO2_nadir", "max_SpO2", "ODI3_total", "ODI3_per_hour", "ODI4_total", "ODI4_per_hour",
    "time_below_95_min", "time_below_90_min", "time_below_85_min", "time_below_80_min",
    "time_below_70_min", "time_below_60_min",
    "time_90_95_min", "time_80_90_min", "time_70_80_min", "time_60_70_min",
    "longest_desat_94_min", "longest_desat_90_min", "longest_desat_80_min",
    "artifact_free_duration_min", "highest_RR", "highest_HR", "odi3time", "odi4time",
    "rpt_gen_ts", "total_desat_events", "window_end", "window_start",
    "baseline_HR", "mean_HR", "lowest_HR", "baseline_RR", "mean_RR", "lowest_RR", "window_used"
];

// async function saveCurrentAnalysis(fileName) {
//     if (waiting) throw new Error("REPORT_PENDING");
//     if (!latestAnalysis) throw new Error("NO_REPORT");
//     const base = getTrimBaseRef();
//     if (!base) throw new Error("NO_SESSION");

//     const key = safeKey(fileName);
//     const ref = getReportsRoot().child(key).child(timestamp);

//     if ((await ref.once("value")).exists()) throw new Error("NAME_EXISTS");

//     const [trimSnap, sessSnap] = await Promise.all([
//         base.once("value"),
//         fb.database().ref().child("session").child(id).child(timestamp).once("value")
//     ]);
//     const trim = trimSnap.val() || {};
//     const s = sessSnap.val() || {};

//     const record = {};
//     SESSION_FIELDS.forEach(k => { record[k] = s[k] !== undefined ? s[k] : null; });
//     ANALYSIS_FIELDS.forEach(k => { record[k] = latestAnalysis[k] !== undefined ? latestAnalysis[k] : null; });
//     record.rsvdby = getDoctorName();
//     record.auto_trim = trim.auto_trim || null;       // { spo: [s1,e1,...] } same as session_trim
//     record.manual_trim = trim.manual_trim || null;   // { hr:[...], spo:[...], ci:[...], rr:[...] }

//     await ref.set(record);
//     return key;
// }
async function saveCurrentAnalysis(fileName) {
    if (waiting) throw new Error("REPORT_PENDING");
    if (!latestAnalysis) throw new Error("NO_REPORT");
    const base = getTrimBaseRef();
    if (!base) throw new Error("NO_SESSION");

    const key = safeKey(fileName);
    const ref = getReportsRoot().child(key).child(timestamp);
    if ((await ref.once("value")).exists()) throw new Error("NAME_EXISTS");

    // const [trimSnap, sessSnap] = await Promise.all([
    //     base.once("value"),
    //     fb.database().ref().child("session").child(id).child(timestamp).once("value")
    // ]);
   const docId = localStorage.getItem("doc_registerId");
const root = fb.database().ref();

const [trimSnap, sA, sB, dS] = await Promise.all([
    base.once("value"),
    root.child("session").child(id).child(docId).child(timestamp).once("value"), // session/{id}/{docId}/{ts}
    root.child("session").child(id).child(timestamp).once("value"),              // session/{id}/{ts}
    root.child("d_session").child(id).child(timestamp).once("value")             // default fallback
]);
const trim = trimSnap.val() || {};

// the session node wins; d_session only fills fields the session node doesn't have
const sessionNode = sA.exists() ? sA.val() : (sB.exists() ? sB.val() : {});
const s = { ...(dS.val() || {}), ...sessionNode };
console.log("SAVE: session source =", sA.exists() ? "session/id/docId/ts" : sB.exists() ? "session/id/ts" : "d_session only", s);

    // const trim = trimSnap.val() || {};
    // const s = sessSnap.val() || {};

    const record = {};
    SESSION_FIELDS.forEach(k => { record[k] = s[k] !== undefined ? s[k] : null; });
    ANALYSIS_FIELDS.forEach(k => { record[k] = latestAnalysis[k] !== undefined ? latestAnalysis[k] : null; });
    record.file_name = fileName;
    record.saved_ts = Math.floor(Date.now() / 1000);
    record.rsvdby = getDoctorName();
    record.auto_trim = trim.auto_trim || null;
    record.manual_trim = trim.manual_trim || null;

    await ref.set(record);
    return key;
}

async function listSavedFiles() {
    const snap = await getReportsRoot().once("value");
    const out = [];
    snap.forEach(nameSnap => {
        if (!nameSnap.hasChild(timestamp)) return;      // saved for another session
        const v = nameSnap.child(timestamp).val() || {};
        out.push({
            id: nameSnap.key,
            file_name: v.file_name || nameSnap.key,
            doctor_name: v.rsvdby,
            saved_ts: v.saved_ts || 0
        });
    });
    return out.sort((a, b) => b.saved_ts - a.saved_ts);
}

async function loadSavedFile(fileId) {
    const v = (await getReportsRoot().child(fileId).child(timestamp).once("value")).val();
    if (!v) return null;

    const manual = {};
    Object.entries(v.manual_trim || {}).forEach(([k, r]) => { manual[k] = parseRanges(r); });

    return {
        trim: {
            hasAuto: !!v.auto_trim,
            autoGaps: v.auto_trim && v.auto_trim.spo ? parseRanges(v.auto_trim.spo) : [],
            manual
        },
        analysis: v      // flat record; paintFn reads rpt_gen_ts, mean_SpO2, etc. directly from svdby
    };
}
// function paintSavedAnalysis(analysis) {
//     if (analysisRef) { analysisRef.off(); analysisRef = null; }
//     stopWaiting();
//     if (analysis && paintFn) paintFn(analysis);
// }

function paintSavedAnalysis(analysis) {
    if (analysisRef) { analysisRef.off(); analysisRef = null; }
    stopWaiting();
    latestAnalysis = analysis || null;   // add this
    if (analysis && paintFn) paintFn(analysis);
}

setFileHandlers({ save: saveCurrentAnalysis, list: listSavedFiles, load: loadSavedFile, paint: paintSavedAnalysis });

let id = "";
let timestamp = "";
function init_echarts() {
  $(document).ready(() => {
    try {
      id = localStorage.getItem("patient_unique_id");
      timestamp = localStorage.getItem("sessiontimestamp");

      var heart_rate;
      var spo2;
      var sbp;
      var dbp;
      var oldtemp;
      var temp;
      var respiration_rate;
      var acc;

      var batteryPercentage;
      var ecg_flag = 0;
      let latestPatHr = null;
      let latestPatHrTs = 0;


      if (id) {
        // Show live Data
        //const ref = fb.database().ref().child("patientlivedata7s").child(id);


        // const ref_chart = fb.database().ref().child("ECG_plot").child(id);
        // alert("a",timestamp);
        getAllParameters(timestamp)



      } else {
        console.warn("ID is not defined");
      }

    } catch (error) {
      console.error(error);
    }
  });
}

let initialTrimActive = false;
let analysisRef = null;
let paintFn = null;   // set inside getAllParameters
const trimActive = t => !!t && (t.hasAuto || Object.values(t.manual).some(g => g.length > 0));

// setTrimChangeHandler(active => renderAnalysis(active));
// let waiting = false, waitBaselineSet = false, waitBaseline = null, waitTimer = null;
// let online = true;
// fb.database().ref(".info/connected").on("value", s => { online = s.val() === true; });
let waiting = false, waitBaselineSet = false, waitBaseline = null;

function stopWaiting() {
  waiting = false;
  // clearTimeout(waitTimer);
  const l = document.getElementById("loaderOverlay");
  if (l) l.style.display = "none";
}

function renderAnalysis(useTrim, waitForUpdate = false) {
  if (analysisRef) analysisRef.off();
  stopWaiting();
  const l0 = document.getElementById("loaderOverlay");
  if (l0) l0.style.display = "flex";   
  const docId = localStorage.getItem("doc_registerId");
  const root = fb.database().ref();
  analysisRef = useTrim
    ? root.child("session_analysis").child(id).child(docId).child(timestamp)
    : root.child("d_session_analysis").child(id).child(timestamp);
// console.log("REPORT NODE:", analysisRef.toString());
  if (useTrim && waitForUpdate) {
    waiting = true;
    waitBaselineSet = false;
    // const l = document.getElementById("loaderOverlay");
    // if (l) l.style.display = "flex";
    //     waitTimer = setTimeout(function check() {
    //   if (!online) { waitTimer = setTimeout(check, 5000); return; }   // offline: keep waiting
    //   stopWaiting();                                                    // online but no new report: hide
    // }, 4500);
    // waitTimer = setTimeout(stopWaiting, 60000);   // safety: never hang forever
  }

  let firstSnap;
  const firstSnapPromise = new Promise(r => { firstSnap = r; });
  analysisRef.on("value", snap => {
    const val = snap.exists() ? snap.val() : null;
    latestAnalysis = val;
    // if (val && paintFn) paintFn(val);
    //to show linked details to perticular session instead of showing same data to all sessions
    if (val && paintFn) {
      paintFn(val);
    } else if (!val) {
      document.querySelectorAll(
        "#rptdatetime,#totalrectime,#afit,#signal_quality,#studyadequacy," +
        "#OxygenationParameters td,.report-table td:not([id^='session'])"
      ).forEach(td => {
        if (!td.id.startsWith("session") && td.id !== "samplingtime") td.innerHTML = "--";
      });
    }
    firstSnap();   // first report snapshot has been painted

    // if (!waiting) return;
      if (!waiting) { stopWaiting(); return; }
    const ts = val ? val.rpt_gen_ts : null;
    if (!waitBaselineSet) {        // first event = what's there before the backend finishes
      waitBaselineSet = true;
      waitBaseline = ts;
      return;
    }
    if (val && ts !== waitBaseline) stopWaiting();   // new report arrived
  // });
  }, err => {
    console.error("ANALYSIS LISTENER ERROR:", err);
    stopWaiting();
    firstSnap();
  });
  return firstSnapPromise;
}

setTrimChangeHandler((active, wait) => renderAnalysis(active, wait));

// async function getAllParameters(timestamp) {
async function getAllParameters(ts) {    //to show linked details to perticular session instead of showing same data to all sessions
  timestamp = ts;

  const spo2_chart = fb.database().ref().child("patientlivedata2s").child(id);
  const sessionanalysis1 = fb.database().ref().child("d_session_analysis").child(id).child(timestamp);
  const rr_chart = fb.database().ref().child("RR_CONCAT").child(id);

  // const session = fb.database().ref().child("session").child(id).orderByKey().limitToLast(1);
  const session = fb.database().ref().child("d_session").child(id).child(timestamp);

  //const oxyhrparams = fb.database().ref().child("session_analysis").child(id).orderByKey().limitToLast(1);
  const oxyhrparams = fb.database().ref().child("d_session_analysis").child(id).child(timestamp);

  let starttimestamp;
  let completedTime;
  let completedtimestamp;
  let minutestotal;
  let startTime;
 const loader = document.getElementById("loaderOverlay");
   loader.style.display = "flex";

  const sessionSnap = await session.once("value");
  if (!sessionSnap.exists()) {
    console.log("Session not found");
    loader.style.display = "none";
    return;
  }
  const sessionData = sessionSnap.val();
  starttimestamp = sessionData.stts === "" ? starttimestamp = "--" : starttimestamp = sessionData.stts;
  completedtimestamp = sessionData.spts === "" ? completedtimestamp = "--" : completedtimestamp = sessionData.spts;
  localStorage.setItem("starttime", starttimestamp);
  localStorage.setItem("completetime", completedtimestamp);
  completedTime = new Date(completedtimestamp * 1000);
  startTime = new Date(starttimestamp * 1000);


  let duration = completedtimestamp - starttimestamp
  
  const hours = Math.floor(duration / 3600);
  minutestotal = Math.floor((duration % 3600) / 60);
  var completeddate = ("0" + completedTime.getDate()).slice(-2) + "/" + ("0" + (completedTime.getMonth() + 1)).slice(-2) + "/" + completedTime.getFullYear();
  var completedtime = ("0" + completedTime.getHours()).slice(-2) + ":" + ("0" + completedTime.getMinutes()).slice(-2) + ":" + ("0" + completedTime.getSeconds()).slice(-2);

  var startdate = ("0" + startTime.getDate()).slice(-2) + "/" + ("0" + (startTime.getMonth() + 1)).slice(-2) + "/" + startTime.getFullYear();
  startTime = ("0" + startTime.getHours()).slice(-2) + ":" + ("0" + startTime.getMinutes()).slice(-2) + ":" + ("0" + startTime.getSeconds()).slice(-2);
  if (document.getElementById("sessiondate")) document.getElementById("sessiondate").innerHTML = completeddate;
  if (document.getElementById("sessionstarttime")) document.getElementById("sessionstarttime").innerHTML = startdate + " " + startTime + " IST";
  if (document.getElementById("sessionendtime")) document.getElementById("sessionendtime").innerHTML = completeddate + " " + completedtime + " IST";
  
  if (document.getElementById("samplingtime")) document.getElementById("samplingtime").innerHTML = " 2 seconds";
  await loadSpo2Data(spo2_chart,rr_chart, sessionanalysis1, starttimestamp, completedtimestamp);
  loader.style.display = "none";




  // const oxySnap = await oxyhrparams.once("value");
  // if (oxySnap.exists()) {
  //   const session = oxySnap.val();
    paintFn = (session) => {
    //let session = snapshot.val();    //let session = snapshot.val();
    // let session = Object.values(data)[0];
    console.log("session in oxyparams", session)
    let totaltime = completedtimestamp - starttimestamp
    completedTime = new Date(completedtimestamp * 1000);
    let rpt_ts = session.rpt_gen_ts;
    console.log("rptts", rpt_ts)
    let rpt = new Date(rpt_ts * 1000)
    //if (document.getElementById("samplingtime")) document.getElementById("samplingtime").innerHTML = completeddate;
    console.log("rpttime", rpt)
    let rectime = session.total_duration_min
    console.log("rectime",rectime)
    let hours = Math.floor(rectime / 60);
    let minutestotal1 = Math.floor((rectime % 60));
    
    if (document.getElementById("totalrectime")) document.getElementById("totalrectime").innerHTML = hours + "h " + " " + minutestotal1 + "min";
    var rptdate;
    var rpttime;
    if (rpt_ts !== undefined) {
      rptdate = ("0" + rpt.getDate()).slice(-2) + "/" + ("0" + (rpt.getMonth() + 1)).slice(-2) + "/" + rpt.getFullYear();
      rpttime = ("0" + rpt.getHours()).slice(-2) + ":" + ("0" + rpt.getMinutes()).slice(-2) + ":" + ("0" + rpt.getSeconds()).slice(-2);
    }
    else {
      rptdate = "--"
      rpttime = "--"
    }
    if (document.getElementById("rptdatetime")) document.getElementById("rptdatetime").innerHTML = rptdate + " " + rpttime + " IST";
    if (document.getElementById("afit")) document.getElementById("afit").innerHTML = splitTimeString(session.artifact_free_duration_min);
    if (document.getElementById("signal_quality")) document.getElementById("signal_quality").innerHTML = session.signal_quality;
    if (document.getElementById("studyadequacy")) document.getElementById("studyadequacy").innerHTML = session.study_adequacy;

    if (document.getElementById("meanspo2")) document.getElementById("meanspo2").innerHTML = session.mean_SpO2 + " %";
    if (document.getElementById("baselinespo2")) document.getElementById("baselinespo2").innerHTML = session.baseline_SpO2 + " %";
    if (document.getElementById("minspo2")) document.getElementById("minspo2").innerHTML = session.min_SpO2_nadir + " %";
    if (document.getElementById("maxspo2")) document.getElementById("maxspo2").innerHTML = session.max_SpO2 + " %";
    if (document.getElementById("odi3-total")) document.getElementById("odi3-total").innerHTML = session.ODI3_total + " events";
    if (document.getElementById("odi3-events")) document.getElementById("odi3-events").innerHTML = session.ODI3_per_hour + " events/hr";
    if (document.getElementById("odi4-total")) document.getElementById("odi4-total").innerHTML = session.ODI4_total + " events";
    if (document.getElementById("odi4-events")) document.getElementById("odi4-events").innerHTML = session.ODI4_per_hour + " events/hr";
    if (document.getElementById("totaldesatevents")) document.getElementById("totaldesatevents").innerHTML = session.total_desat_events + " events";
    if(minutestotal)
    {
    if (document.getElementById("timebelow95")) document.getElementById("timebelow95").innerHTML = session.time_below_95_min + " min  (" + (((session.time_below_95_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebelow90")) document.getElementById("timebelow90").innerHTML = session.time_below_90_min + " min  (" + (((session.time_below_90_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebelow85")) document.getElementById("timebelow85").innerHTML = session.time_below_85_min + " min  (" + (((session.time_below_85_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebelow80")) document.getElementById("timebelow80").innerHTML = session.time_below_80_min + " min  (" + (((session.time_below_80_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebelow70")) document.getElementById("timebelow70").innerHTML = session.time_below_70_min + " min  (" + (((session.time_below_70_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebelow60")) document.getElementById("timebelow60").innerHTML = session.time_below_60_min + " min  (" + (((session.time_below_60_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    
  
    if (document.getElementById("timebetween90")) document.getElementById("timebetween90").innerHTML = session.time_90_95_min + " min (" + (((session.time_90_95_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebetween80")) document.getElementById("timebetween80").innerHTML = session.time_80_90_min + " min (" + (((session.time_80_90_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebetween70")) document.getElementById("timebetween70").innerHTML = session.time_70_80_min + " min (" + (((session.time_70_80_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    if (document.getElementById("timebetween60")) document.getElementById("timebetween60").innerHTML = session.time_60_70_min + " min (" + (((session.time_60_70_min / session.artifact_free_duration_min) * 100).toFixed(1)) + "%)";
    }
    else
    {
    if (document.getElementById("timebelow95")) document.getElementById("timebelow95").innerHTML = session.time_below_95_min + " min  (" +  "0 %)";
    if (document.getElementById("timebelow90")) document.getElementById("timebelow90").innerHTML = session.time_below_90_min + " min  (" +  "0 %)";
    if (document.getElementById("timebelow85")) document.getElementById("timebelow85").innerHTML = session.time_below_85_min + " min  (" +  "0 %)";
    if (document.getElementById("timebelow80")) document.getElementById("timebelow80").innerHTML = session.time_below_80_min + " min  (" +  "0 %)";
    if (document.getElementById("timebelow70")) document.getElementById("timebelow70").innerHTML = session.time_below_70_min + " min  (" +  "0 %)";
    if (document.getElementById("timebelow60")) document.getElementById("timebelow60").innerHTML = session.time_below_60_min + " min  (" +  "0 %)";
    
  
    if (document.getElementById("timebetween90")) document.getElementById("timebetween90").innerHTML = session.time_90_95_min + " min (" + "0 %)";
    if (document.getElementById("timebetween80")) document.getElementById("timebetween80").innerHTML = session.time_80_90_min + " min (" + "0 %)";
    if (document.getElementById("timebetween70")) document.getElementById("timebetween70").innerHTML = session.time_70_80_min + " min (" + "0 %)";
    if (document.getElementById("timebetween60")) document.getElementById("timebetween60").innerHTML = session.time_60_70_min + " min (" + "0 %)";
      
    }
    
    if (document.getElementById("lcrspo294")) document.getElementById("lcrspo294").innerHTML = session.longest_desat_94_min + " min ";
    if (document.getElementById("lcrspo290")) document.getElementById("lcrspo290").innerHTML = session.longest_desat_90_min + " min ";
    if (document.getElementById("lcrspo280")) document.getElementById("lcrspo280").innerHTML = session.longest_desat_80_min + " min ";


    if (document.getElementById("baselinehr")) document.getElementById("baselinehr").innerHTML = session.baseline_HR + " bpm";
    if (document.getElementById("meanhr")) document.getElementById("meanhr").innerHTML = session.mean_HR + " bpm";
    if (document.getElementById("lowhr")) document.getElementById("lowhr").innerHTML = session.lowest_HR + " bpm";
    if (document.getElementById("highhr")) document.getElementById("highhr").innerHTML = session.highest_HR + " bpm";
    if (document.getElementById("baselinerr")) document.getElementById("baselinerr").innerHTML = session.baseline_RR + " breaths/min";
    if (document.getElementById("meanrr")) document.getElementById("meanrr").innerHTML = session.mean_RR + " breaths/min";
    if (document.getElementById("lowrr")) document.getElementById("lowrr").innerHTML = session.lowest_RR + " breaths/min";
    if (document.getElementById("highrr")) document.getElementById("highrr").innerHTML = session.highest_RR + " breaths/min";

  };
renderAnalysis(initialTrimActive);

// refreshFilesDropdown();
await refreshFilesDropdown(undefined, true);

}
async function loadSpo2Data(spo2_chart, rr_chart,sessionanalysis1, starttimestamp, completedtimestamp) {

 

  try {

    // console.log("timestamp1",timestamp);
  

    // let sttime = String(localStorage.getItem("sessiontimestamp"));
    // const endtime = String(localStorage.getItem("completetime"));
    let sttime = String(starttimestamp);
    let endtime = String(completedtimestamp);
    // alert("starttime" + sttime + "endtime" + endtime)
  
              const [spo2Snap, rrSnap, sessionSnap] = await Promise.all([
                spo2_chart.orderByKey().startAt(sttime).endAt(endtime).once("value"),
                rr_chart.orderByKey().startAt(sttime).endAt(endtime).once("value"),
                sessionanalysis1.once("value")
              ]);

              // =========================
              // ❌ No SPO2 data
              // =========================
              if (!spo2Snap.exists()) {
                console.log("No SPO2 data found");
                showNoData("heart_rate_echart_content");
                showNoData("spo2_echart_content");
                showNoData("resp_rate_echart_content")
                return;
              }

              // =========================
              // SPO2 + HR parsing
              // =========================
              let hrdata = [];
              let spo2data = [];
              let rrdata1=[];

              spo2Snap.forEach((child) => {
                const value = child.val();
                const key = Number(child.key);

                if (value?.hr != null && value?.spo2 != null) {
                  hrdata.push([key*1000, value.hr]);
                  spo2data.push([key*1000, value.spo2]);
                  rrdata1.push([key*1000,value.rr]);
                }
              });
              console.log("spo2data",rrdata1 )
              console.log("hrdata",hrdata)
              
              // =========================
              // ODI data
              // =========================
              let odi3data = [];
              let odi4data = [];

              if (sessionSnap.exists()) {
                const key = sessionSnap.key;
                const value = sessionSnap.val();
                console.log("odi4time raw:", value.odi3time, typeof value.odi3time);
                const parseTimeArray = (obj, level) => {
                    let arr = obj;

                    // convert string "[1781975860]" → [1781975860]
                    if (typeof obj === "string") {
                      try {
                        arr = JSON.parse(obj);
                      } catch (e) {
                        // fallback if not valid JSON
                        arr = obj.replace(/\[|\]/g, "").split(",");
                      }
                    }

                    return (Array.isArray(arr) ? arr : [])
                      .map(t => Number(t))
                      .filter(Number.isFinite)
                      .map(t => [t < 1e12 ? t * 1000 : t, level]);
                  };

               if (value?.odi4time) {
                   odi4data = parseTimeArray(value.odi4time, 105);
               }
              if (value?.odi3time) {
                   odi3data = parseTimeArray(value.odi3time, 103);
              }


            }
              
              console.log("odi3data",odi3data)
              // =========================
              // RR parsing (FIXED)
              // =========================
              let rrdata = [];

              if (rrSnap.exists()) {
                rrSnap.forEach((child) => {
                  const value = child.val();
                  const timestamp = Number(value?.timestamp);

                  if (!value?.values) return;

                  const matches = value.values.match(/\[([^\]]+)\]/g);
                  if (!matches) return;

                  const rrArray = matches
                    .map(group =>
                      group
                        .replace(/\[|\]/g, "")
                        .split(",")
                        .map(v => Number(v.trim()))
                    )
                    .flat();

                  const interval = 40; // adjust if needed (1 sec, 2 sec, etc.), for CI every 40ms one point is coming
                  const base = timestamp *1000
                  rrArray.forEach((rr, i) => {
                    rrdata.push([
                      base + i * interval,
                      rr
                    ]);
                  });
                });
              }

              console.log("RR DATA FINAL:", rrdata);
              let windows  = createTimeWindows((completedtimestamp-starttimestamp),starttimestamp,completedtimestamp)
              // createWindowTabs(windows,hrdata,spo2data,rrdata,rrdata1,odi3data,odi4data);
              const savedTrim = await loadSavedTrim();
              // initialTrimActive = trimActive(savedTrim);  
              initialTrimActive = false;
              createWindowTabs(windows, hrdata, spo2data, rrdata, rrdata1, odi3data, odi4data, savedTrim);
             
            }
            catch (err) {
              console.error("Error loading charts:", err);
            }
  finally {
    
  }
}


function splitTimeString(num) {
  const [minStr, secStr] = String(num).split('.');
  //to show linked details to perticular session instead of showing same data to all sessions
  // let hours = 0;
  // let min = 0;
  const minutes = parseInt(minStr, 10) || 0;
const hours = Math.floor(minutes / 60);
const min = minutes % 60;
  const seconds = parseInt(secStr, 10) || 0;

  // return `${hours} hr ${minutes} min ${seconds} sec`;
  return `${hours}h ${min}min`;
}
function getBatteryIcon(batteryPercentage) {
  if (batteryPercentage >= 90) {
    return '<i class="fa fa-battery-full" aria-hidden="true"></i> ';
  } else if (batteryPercentage >= 60) {
    return '<i class="fa fa-battery-three-quarters" aria-hidden="true"></i> ';
  } else if (batteryPercentage >= 30) {
    return '<i class="fa fa-battery-half" aria-hidden="true"></i> ';
  } else if (batteryPercentage >= 10) {
    return '<i class="fa fa-battery-quarter" aria-hidden="true"></i> ';
  } else {
    return '<i class="fa fa-battery-empty" aria-hidden="true"></i> ';
  }
}

window.onload = () => {
  init_echarts();
};

export { init_echarts, getAllParameters };
