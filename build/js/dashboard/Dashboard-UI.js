export async function patient_details(patient_info) {
  console.log("patientinfo", patient_info)

  function sortFunction(a, b) {
    if (a[5] === b[5]) {
      return 0;
    } else {
      return a[5] > b[5] ? -1 : 1;
    }
  }

  console.log("patientinfo", patient_info)

  var modal = document.getElementById("myModal");

  var span = document.getElementsByClassName("close")[0];

  window.onclick = function (event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  };


  if ($("#p_details").length) {
    const products = document.getElementById("p_details");

    if (!products) {
      return;
    }

     products.innerHTML = "";

    //console.log("1", patient_info.length);
    for (var i = 0; i < patient_info.length; i++) {
      createCard(patient_info[i]);
    }

    function createCard(patientDetails) {


      const [name, age, gender,completedDate, completedTime,patient_id_no, latesttimestamp,dur,status,signal_qual,studyadequacy] = patientDetails;

      const ageLabel = age === undefined || age === null || age === "" ? "--" : `${age}`;
      const genderLabel = gender === undefined || gender === null || gender === "" ? "--" : gender === "M" ? "Male" : "Female";
      const completeDateLabel = completedDate === undefined || completedDate === null || completedDate === "" ? "--" : completedDate;
      const completeTimeLabel = completedTime === undefined || completedTime === null || completedTime === "" ? "--" : completedTime;
      const durationLabel = dur === undefined || dur === null || dur === "" ? "--" : dur;
      const statusLabel = status === undefined || status === null || status === "" ? "--" : `${status}` ;
      const sig = signal_qual === undefined || signal_qual === null || signal_qual === "" ? "--" : `${signal_qual}` ;
      const study = studyadequacy === undefined || studyadequacy === null || studyadequacy === "" ? "--" : `${studyadequacy}`;
      //    const imgSrc = gender=="F"? "../../../production/images/Female.jpg"
      // : "../../../production/images/Male.jpg";
      //  const imgSrc = gender=="F"? "https://svasthyahealth.com/cmc-pediatrics/production/images/Female.jpg"
      // : "https://svasthyahealth.com/cmc-pediatrics/production/images/Male.jpg";
      //Changed this to show male female icon at dashboard
      const imgSrc = gender === "F"
        ? new URL("../../../production/images/Female.jpg", import.meta.url).href
        : new URL("../../../production/images/Male.jpg", import.meta.url).href;
      
      let statusClass="";
      switch (statusLabel) {
        case "Active":
          statusClass = "status-active";
          break;
        case "Incomplete":
          statusClass = "status-incomplete";
          break;
        case "Complete":
          statusClass = "status-complete";
          break;
      }
      let code =`
				<div class="card shadow-sm border-0 rounded-4 black-card id=${patient_id_no}">

    <!-- HEADER -->
     
<div class="card">
    <div class="patient-header">
    <div class="patient-header-left">
        <div class="patient-card__name">${name}</div>
        <div class="patient-age">
            Age: ${ageLabel}  Years
        </div>
    </div>
    
    <div class="patient-header-right">
        <img src=${imgSrc} class="patient-avatar" alt="Male">
    </div>
    </div>
    <div class="card-body">
    
        
        <table class="report-table">
        <tbody>
          <tr>
            <th>Signal Quality:</th>
            <td>${sig}</td>
          </tr>

        <tr>
            <th>Study Adequacy:</th>
            <td>${study}</td>
        </tr>
          <tr>
            <th>Status:</th>
            <td class="${statusClass}">${statusLabel}</td>
         </tr>

        
        </tbody>
        </table>
  
    <div class="container-fluid p-0">

        
        <!-- Heading -->
        <div class="row mb-2">
            <div class="col-12 p-lg-5 ">
                <strong class="text-primary">Last Completed Session</strong>
            </div>
        </div>

      <div class="session-row">
          <div class="session-box">
              <small>Date</small>
              <div>${completeDateLabel}</div>
          </div>

          <div class="session-box">
              <small>Time</small>
              <div>${completeTimeLabel}</div>
          </div>

          <div class="session-box">
              <small>Duration</small>
              <div>${durationLabel}</div>
          </div>
      </div>
    </div>

</div>
					`;
		

    //   let code = `<div class="patient-card" id="${patient_id_no}">
    //               <div class="patient-card__shell">

    //   <!-- TOP ROW -->
    //   <div class="patient-card__top">

    //     <div class="patient-card__title">
    //       ${name}
    //     </div>
    // </div>

    // <!-- META ROW -->
    // <div class="patient-card__meta">
    //   <span>${ageLabel}Y</span>
    //   <span>${genderLabel}</span>
    //   <span>${completeLabel}</span>
    //   <span>${durationLabel}</span>
    // </div> </div></div>`

      products.insertAdjacentHTML("beforeend", code);
      // console.log("3", products.innerHTML)
    }

    function toggleCard(event, btn) {
      event.stopPropagation();

      const card = btn.closest('.patient-card__shell');
      const sessions = card.querySelector('.patient-card__sessions');


      sessions.classList.toggle('open');
    }

    document.querySelectorAll('.patient-card__action').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    });

    const items = products.children;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      /// const sessionTimestamp = localStorage.getItem("sessiontimestamp");
      item.addEventListener("click", function (index) {
        history.pushState({ page: "index" }, "Title", "../production/index.html");
        cardclick(patient_info[i][5], patient_info[i][6]);
      });
    }

    if (typeof window.flushPendingBlinkAlerts === "function") {
      window.flushPendingBlinkAlerts();
    }

    const loader = document.querySelector(".loader");
    loader.classList.add("loader--hidden");
  }
}

function refreshews(ews_value, ews_color, ID) {
  var ewsvId = "ewsv" + ID;
  var ewscId = "ewsc" + ID;

  var ews_v = document.getElementById(ewsvId);
  var ews_c = document.getElementById(ewscId);

  if (ews_v === null) {
  } else {
    ews_v.textContent = ews_value;
    ews_c.style.background = ews_color;
    ews_c.style.borderRadius = "10px";
  }
}
