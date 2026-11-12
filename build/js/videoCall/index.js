import { fb } from "../firebase/config.js";

import { showToast } from "../backend/toastmsg.js";

export var userjoin = false;
// create Agora client
$("#defaultOpen").on("click", function (e) {
  //  $("#LiveSpecification").load(location.href + " #LiveSpecification");
  //openPage("LiveComponents", this, "#FEDEF", 6);

  openPage("SessionDetails", this, "#FEDEF", 16);
});
$("#openoxy").on("click", function (e) {
  //  $("#LiveSpecification").load(location.href + " #LiveSpecification");
  //openPage("LiveComponents", this, "#FEDEF", 6);
  openPage("OxygenationParameters", this, "#FEDEF", 16);
});

$("#openhr").on("click", function (e) {
  //  $("#LiveSpecification").load(location.href + " #LiveSpecification");
  //openPage("LiveComponents", this, "#FEDEF", 6);
  openPage("HRParameters", this, "#FEDEF", 16);
});

$("#openhistory").on("click", function (e) {
  openPage("HistoryComponents", this, "#FEDEF", 16);
  //document.getElementById("onehourbutton").click();
});
var docId = localStorage.getItem("doctor_id");
var patientname = localStorage.getItem("patientname");
var uid = localStorage.getItem("patient_unique_id");
var docname = localStorage.getItem("docname");
//var openpage = urlParams.get("openpage");

function openPage(pageName, elmnt, color, lineno) {
  $(".right_col").hide(); // hide all elements with the class "right_col"
  $("#" + pageName).show(); // show the element with the ID equal to the value of pageName

  // ECharts measures container size at render time.
  // Since we hide/show entire sections, force a resize pass after the DOM updates.
  try {
    window.dispatchEvent(new Event("sidebar:toggled"));
    window.dispatchEvent(new Event("resize"));
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    setTimeout(() => window.dispatchEvent(new Event("resize")), 150);
  } catch {
    // ignore
  }

  // Remove the background color property from all tablink buttons
  $(".tablink").css("background-color", "");

  // Set the background color of the clicked tablink button to #0f7fb893
  $(elmnt).css("background-color", "#0f7fb893");

}

