
let isZoomed = false;
const SEL_KEY = "lastTrimmedFileId";
const getSel = () => sessionStorage.getItem(SEL_KEY);
const setSel = v => sessionStorage.setItem(SEL_KEY, v);
localStorage.removeItem(SEL_KEY);   // drop the old localStorage copy

// logout -> forget the selection, so the next login opens the latest saved file
document.getElementById("logout")?.addEventListener("click", () => {
    sessionStorage.removeItem(SEL_KEY);
}, true);

const MAX_POINTS = 120000;
// const MIN_WINDOW = 60 * 1000;          // 60 seconds
const MIN_WINDOW = 30 * 1000;          // 30 seconds
// const MAX_WINDOW = 2 * 60 * 60 * 1000; // 2 hours
// const TAB = 2*60 *60;

const MAX_WINDOW = 60 * 60 * 1000; // 1 hour
const TAB = 60 * 60;

let currentWindow = MAX_WINDOW;
let vitalCache = {};
let windows = [];

// all option
let allWindows = [];
let tabButtons = [];
let pendingOdiZoomTs = null;

// auto trim
const TRIM_GAP_MS = 2 * 60 * 1000; // 2 minutes
// const TRIM_GAP_MS = 2 * 1000;
let isTrimEnabled = false;
let trimMap = null;
let effectiveTrimMap = null;


// preload ODI icons so they are ready (and the charts redraw) when first needed
["down-blue.png", "down-red.png"].forEach(name => {
    const img = new Image();
    img.onload = () => getCharts().forEach(c => c.resize());
    img.src = "https://svasthyahealth.com/cmc-pediatrics1/production/images/" + name;
});

window.getEffectiveTrimMap = () => effectiveTrimMap;

// manual trim 
let savedAutoGaps = null;   // auto-trim gaps loaded from an svdby file

function rebuildEffectiveTrimMap() {
    const gaps = [];
    if (isTrimEnabled) {
        const auto = savedAutoGaps || (trimMap && trimMap.gaps) || [];
        gaps.push(...auto);
    }
    if (manualTrimGaps.length) gaps.push(...manualTrimGaps);
    effectiveTrimMap = gaps.length ? buildTrimMap(gaps) : null;
}

// manual trim
let manualTrimGaps = [];
let trimRectChart = null;
let trimStart = null;
let manualTrimWindowIndex = null;

// multiple selection for manual trim
let pendingRanges = [];   // [{ start, end, shapes }]  start/end are REAL timestamps
let draftShapes = null;   // box currently being dragged
let trimPopup = null;

// to save manual trim data in db
let manualTrimSaveHandler = null;
function setManualTrimSaveHandler(fn) {
    manualTrimSaveHandler = fn;
}

// to save auto trim data in db
let autoTrimSaveHandler = null;
function setAutoTrimSaveHandler(fn) {
    autoTrimSaveHandler = fn;
}

// to remove saved trim in db on reset
let trimResetHandler = null;
function setTrimResetHandler(fn) {
    trimResetHandler = fn;
}

// tell database_function.js whether a trim is active, so it switches DB node
let trimChangeHandler = null;
function setTrimChangeHandler(fn) { trimChangeHandler = fn; }

function notifyTrimChange(active, waitForUpdate = false) {
    return trimChangeHandler ? trimChangeHandler(active, waitForUpdate) : Promise.resolve();
}

// ---------- file handlers (registered by database_function.js) ----------
let saveFileHandler = null, listFilesHandler = null, loadFileHandler = null, paintSavedHandler = null;
function setFileHandlers({ save, list, load, paint }) {
    saveFileHandler = save; listFilesHandler = list; loadFileHandler = load; paintSavedHandler = paint;
}

let cleanSig = "";
let baselineSet = false;          // no baseline yet -> never "dirty"

function trimSig() {
    const auto = isTrimEnabled ? (savedAutoGaps || (trimMap && trimMap.gaps) || []) : [];
    return JSON.stringify({
        auto: auto.map(g => [g.start, g.end]),
        manual: mergeGaps(manualTrimGaps).map(g => [g.start, g.end])
    });
}
const isDirty = () => baselineSet && trimSig() !== cleanSig;

function refreshSaveBtn() {
    const btn = document.getElementById("saveFileBtn");
    if (!btn) return;
    const onRaw = (document.getElementById("filesDropdown")?.value ?? "raw") === "raw";
    // Raw: any trim is unsaved work. Saved file: only after a change.
    const canSave = onRaw ? hasAnyTrim() : isDirty();
    btn.disabled = !canSave;
    btn.classList.toggle("has-changes", canSave);
}

function setDirty(v) {
    if (!v) { cleanSig = trimSig(); baselineSet = true; }
    refreshSaveBtn();
}

// generic modal: confirm (true/false)
function showModal({ message, input = false, yesText = "Yes", noText = "No" }) {
    return new Promise(resolve => {
        const ov = document.createElement("div");
        ov.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.55);" +
                           "display:flex;align-items:center;justify-content:center;";
        ov.innerHTML = `
          <div style="background:#fff;color:#222;border-radius:8px;padding:20px 24px;max-width:420px;
                      width:90%;box-shadow:0 8px 30px rgba(0,0,0,.3);">
            <p class="m-msg" style="margin:0 0 14px;font-size:15px;"></p>
            ${input ? '<input class="m-input" type="text" maxlength="60" style="width:100%;padding:6px 8px;">' : ""}
            <div class="m-err" style="color:#c00;font-size:12px;min-height:16px;margin:4px 0 8px;"></div>
            <div style="text-align:right;">
              ${noText ? '<button type="button" class="m-no btn btn-default"></button> ' : ""}
              <button type="button" class="m-yes btn btn-primary"></button>
            </div>
          </div>`;
        ov.querySelector(".m-msg").textContent = message;
        ov.querySelector(".m-yes").textContent = yesText;
        if (noText) ov.querySelector(".m-no").textContent = noText;
        const field = ov.querySelector(".m-input");

        const close = val => { document.removeEventListener("keydown", onKey); ov.remove(); resolve(val); };
        const yes = () => {
            if (!input) return close(true);
            const v = field.value.trim();
            if (!v) { ov.querySelector(".m-err").textContent = "File name is required."; return; }
            close(v);
        };
        const no = () => close(input ? null : false);
        const onKey = e => { if (e.key === "Escape") no(); if (e.key === "Enter" && input) yes(); };

        ov.querySelector(".m-yes").addEventListener("click", yes);
        ov.querySelector(".m-no")?.addEventListener("click", no);
        document.addEventListener("keydown", onKey);
        document.body.appendChild(ov);
        (field || ov.querySelector(".m-yes")).focus();
    });
}

// true = proceed with the navigation / file switch, false = stay on the page
async function guardUnsaved() {
    if (!isDirty()) return true;                 // nothing unsaved -> no popup
    const yes = await showModal({
        message: "You have unsaved changes. Are you sure you want to leave without saving?",
        yesText: "Yes", noText: "No"
    });
    if (!yes) return false;                      // No  -> stay, keep changes
    clearTrimSelection();                        // Yes -> discard and proceed
    return true;
}

document.addEventListener("click", async e => {
    if (!e.isTrusted || !isDirty()) return;
    const a = e.target.closest("a, #logout");
    if (!a || !a.closest(".top_nav, .left_col, #logout")) return;

    e.preventDefault();
    e.stopImmediatePropagation();
    if (await guardUnsaved()) a.click();      // Yes -> go, No -> stay
}, true);

function hasAnyTrim() {
    return (isTrimEnabled && trimMap && trimMap.gaps.length > 0) || manualTrimGaps.length > 0;
}

// Default reset: remove auto + manual trim, show all data like a fresh page load
async function resetTrimToDefault() {
    // if (!confirm("Reset to default? All auto and manual trims will be removed.")) return false;
    if (trimResetHandler) await trimResetHandler();

    clearTrimSelection();
    manualTrimGaps = [];
    savedAutoGaps = null;          
    isTrimEnabled = false;
    sessionTrimMode = "";
    applyTrimButtonState("");

    const allStore = getAllTrimStore();
    allStore[currentSessionKey] = "";
    saveTrimStore(allStore);

    rebuildEffectiveTrimMap();                  // becomes null

        // remove session_trim/{UUID}/{docId}/{session start} in the DB
    // if (trimResetHandler) trimResetHandler();

    // notifyTrimChange(false); 
    const reportReady = notifyTrimChange(false);
    // back to the default zoom state
    isManualZoom = false;
    isZoomed = false;
    currentWindow = MAX_WINDOW;

    if (selectedWindow) {
        loadWindow(
            selectedWindow,
            vitalCache.hr, vitalCache.spo2, vitalCache.rr,
            vitalCache.rr1, vitalCache.odi3, vitalCache.odi4
        );
    }
    showResetButton(false);
    updateNavigationButtons();
    await reportReady;   // keep the overlay until the default report is painted
    setDirty(false);
    return true;
}
let trimRestoreHandler = null;
function setTrimRestoreHandler(fn) {
    trimRestoreHandler = fn;
}

async function restoreLastTrim() {
    if (!trimRestoreHandler) return;

    const savedTrim = await trimRestoreHandler();
    if (!savedTrim) return;   // nothing saved, stay on default report

    manualTrimGaps = [];
    Object.entries(savedTrim.manual).forEach(([key, gaps]) => {
        gaps.forEach(g => manualTrimGaps.push({ start: g.start, end: g.end, chart: key }));
    });
    sessionTrimMode = savedTrim.hasAuto ? "automatic" : "";
    isTrimEnabled = (sessionTrimMode === "automatic");

    applyTrimButtonState(sessionTrimMode);

    const allStore = getAllTrimStore();
    allStore[currentSessionKey] = sessionTrimMode;
    saveTrimStore(allStore);

    rebuildEffectiveTrimMap();
    // notifyTrimChange(hasAnyTrim());   // session_analysis if a trim was restored
    const reportReady = notifyTrimChange(hasAnyTrim());

    if (selectedWindow) {
        loadWindow(
            selectedWindow,
            vitalCache.hr, vitalCache.spo2, vitalCache.rr,
            vitalCache.rr1, vitalCache.odi3, vitalCache.odi4
        );
    }
    updateNavigationButtons();
    await reportReady;
}
function getChartKey(chart) {
    if (chart === window.hrChart) return "hr";
    if (chart === window.spo2Chart) return "spo";
    if (chart === window.rrChart) return "ci";
    if (chart === window.rrChart1) return "rr";
    return "unknown";
}


function removeTrimPopup() {
    if (trimPopup) {
        trimPopup.remove();
        trimPopup = null;
    }
}


function makeSelectionShapes(x1, x2, top, height) {
    const fill = new echarts.graphic.Rect({
        shape: { x: Math.min(x1, x2), y: top, width: Math.abs(x2 - x1), height },
        style: { fill: "rgba(255,0,0,0.25)" },
        silent: true,
        z: 99
    });
    const startLine = new echarts.graphic.Line({
        shape: { x1, y1: top, x2: x1, y2: top + height },
        style: { stroke: "#ff0000", lineWidth: 1 },
        silent: true,
        z: 100
    });
    const endLine = new echarts.graphic.Line({
        shape: { x1: x2, y1: top, x2: x2, y2: top + height },
        style: { stroke: "#ff0000", lineWidth: 1 },
        silent: true,
        z: 100
    });
    return { fill, startLine, endLine };
}

function addShapes(chart, s) {
    const zr = chart.getZr();
    zr.add(s.fill);
    zr.add(s.startLine);
    zr.add(s.endLine);
}

function removeShapes(chart, s) {
    if (!s || !chart) return;
    const zr = chart.getZr();
    zr.remove(s.fill);
    zr.remove(s.startLine);
    zr.remove(s.endLine);
}

// charts that are currently visible (CI is hidden in "All" view)
function getTrimCharts() {
    return getCharts().filter(c => {
        const el = c.getDom();
        return el && el.offsetParent !== null;
    });
}

// a selection is now a list of { chart, s } (one box per chart)
function removeShapeList(list) {
    if (!list) return;
    list.forEach(({ chart, s }) => {
        if (chart.isDisposed()) return;
        removeShapes(chart, s);
        chart.getZr().refresh();
    });
}

function redrawPendingRanges() {
    console.log("trim charts:", getTrimCharts().map(getChartKey), "ci exists:", !!window.rrChart);
    if (!pendingRanges.length) return;
    const charts = getTrimCharts();

    pendingRanges.forEach(r => {
        removeShapeList(r.shapes);
        r.shapes = [];

        const vStart = effectiveTrimMap ? effectiveTrimMap.toVirtual(r.start) : r.start;
        const vEnd = effectiveTrimMap ? effectiveTrimMap.toVirtual(r.end) : r.end;

        charts.forEach(chart => {
            const gridRect = chart.getModel().getComponent("grid", 0).coordinateSystem.getRect();
            const minX = gridRect.x;
            const maxX = gridRect.x + gridRect.width;

            const px1 = chart.convertToPixel({ xAxisIndex: 0 }, vStart);
            const px2 = chart.convertToPixel({ xAxisIndex: 0 }, vEnd);

            // completely outside the visible area -> don't draw
            if (px2 < minX || px1 > maxX) return;

            const x1 = Math.max(minX, px1);
            const x2 = Math.min(maxX, px2);
            if (x2 - x1 < 1) return;

            const s = makeSelectionShapes(x1, x2, gridRect.y, gridRect.height);
            addShapes(chart, s);
            r.shapes.push({ chart, s });
        });
    });

    charts.forEach(c => c.getZr().refresh());
}

function refreshTrimSelections() {
    if (pendingRanges.length) redrawPendingRanges();
}

function clearTrimSelection() {
    removeShapeList(draftShapes);
    pendingRanges.forEach(r => removeShapeList(r.shapes));

    draftShapes = null;
    pendingRanges = [];
    trimRectChart = null;
    trimStart = null;

    removeTrimPopup();
}
const isDefaultActive = () =>
    (document.getElementById("filesDropdown")?.value ?? "raw") === "raw" && !hasAnyTrim();
function showManualTrimPopup(chart, anchorX) {
    removeTrimPopup();

    // always attach to the top (HR) chart so the button appears at the top
    const topChart = (window.hrChart && !window.hrChart.isDisposed()) ? window.hrChart : chart;
    const container = topChart.getDom().parentElement;

    const popup = document.createElement("div");
    popup.className = "manual-trim-popup";
    popup.style.left = `${anchorX}px`;
    popup.style.top = "4px";
    popup.style.transform = "translate(-50%, 0)";   // sits below the top edge, not above it
    popup.innerHTML = `
        <button class="manual-trim-popup__confirm"> Manual Trim</button>
        <button class="manual-trim-popup__cancel">✕</button>
    `;

    popup.querySelector(".manual-trim-popup__confirm").addEventListener("click", async () => {
    if (!pendingRanges.length) return;

    // --- capture current zoom before the trim map changes ---
    let savedRealStart = null;
    let savedRealEnd = null;
    const zoomChartBefore = activeChart || window.hrChart;
    if (isManualZoom && zoomChartBefore) {
        const dzBefore = zoomChartBefore.getOption().dataZoom[0];
        if (dzBefore && dzBefore.startValue != null && dzBefore.endValue != null) {
            const oldTrimMap = effectiveTrimMap; // map as it is NOW, before rebuild
            savedRealStart = oldTrimMap ? oldTrimMap.toReal(dzBefore.startValue) : dzBefore.startValue;
            savedRealEnd = oldTrimMap ? oldTrimMap.toReal(dzBefore.endValue) : dzBefore.endValue;
        }
    }
        const srcKey = getChartKey(chart);   // `chart` is the argument of showManualTrimPopup
  const wasDefault = isDefaultActive(); 
    pendingRanges.forEach(r => {
        manualTrimGaps.push({ 
            start: r.start,
            end: r.end, 
            chart: srcKey
        });
    });
    rebuildEffectiveTrimMap();
        setRestoreSwitch(false);

    // // ONE save per click, all gaps of this chart
    // if (manualTrimSaveHandler) {
    //     manualTrimSaveHandler(
    //         srcKey,
    //         mergeGaps(manualTrimGaps.filter(g => g.chart === srcKey))
    //     );
    // }
    // trim applies to ALL charts, so save the merged ranges ONCE
// if (manualTrimSaveHandler) {
//     const allGaps = mergeGaps(manualTrimGaps);   // every manual gap, any source chart
//     const byChart = {};
//     ["hr", "spo", "ci", "rr"].forEach(k => { byChart[k] = allGaps; });

//     manualTrimSaveHandler(byChart);              // ONE call, ONE write
// }
// notifyTrimChange(true);           // session_analysis

const allGaps = mergeGaps(manualTrimGaps);
const byChart = {};
["hr", "spo", "ci", "rr"].forEach(k => { byChart[k] = allGaps; });

// const savePromise = manualTrimSaveHandler
//     ? manualTrimSaveHandler(byChart)
//     : Promise.resolve();
// // savePromise.finally(() => notifyTrimChange(true));   // after the DB write finishes
// savePromise.finally(() => notifyTrimChange(true, true));
await notifyTrimChange(true, true);
// if (manualTrimSaveHandler) manualTrimSaveHandler(byChart);  // then save
if (manualTrimSaveHandler) await manualTrimSaveHandler(byChart, wasDefault);
    clearTrimSelection();   // after the save: it empties pendingRanges

    loadWindow(
        selectedWindow,
        vitalCache.hr,
        vitalCache.spo2,
        vitalCache.rr,
        vitalCache.rr1,
        vitalCache.odi3,
        vitalCache.odi4
    );

    // --- re apply the saved zoom, converted into trimmed space ---
    if (savedRealStart != null && savedRealEnd != null) {
        requestAnimationFrame(() => {
            const newStart = effectiveTrimMap ? effectiveTrimMap.toVirtual(savedRealStart) : savedRealStart;
            const newEnd = effectiveTrimMap ? effectiveTrimMap.toVirtual(savedRealEnd) : savedRealEnd;

            ignoreZoomEvent = true;

            getCharts().forEach(chart => {
                if (!chart.__rawData || chart.__rawData.length === 0) return;
                chart.dispatchAction({
                    type: "dataZoom",
                    startValue: newStart,
                    endValue: newEnd,
                    animation: false
                });
            });

            requestAnimationFrame(() => {
                getCharts().forEach(chart => updateYAxis(chart));
                ignoreZoomEvent = false;
                isManualZoom = true;
                showResetButton(true);
                updateNavigationButtons();
            });
        });
    }
});

    popup.querySelector(".manual-trim-popup__cancel").addEventListener("click", () => {
        clearTrimSelection();
    });

    container.appendChild(popup);
    trimPopup = popup;
}


const TRIM_STORAGE_KEY = "vitalsSessionTrimMode";
let sessionTrimMode = "";
let currentSessionKey = null;

//zoom
let zoomRafScheduled = false;
let resetButtonVisible = false;
//

function getAllTrimStore() {
    try {
        return JSON.parse(localStorage.getItem(TRIM_STORAGE_KEY) || "{}");
    } catch {
        return {};
    }
}

function saveTrimStore(allStore) {
    localStorage.setItem(TRIM_STORAGE_KEY, JSON.stringify(allStore));
}

function normalizeTs(ts) {
    ts = Number(ts);
    return ts < 1e12 ? ts * 1000 : ts;
}

//Strictly trim gap >= 2 minutes on SPO2 for auto trim 
function computeSpo2Gaps(spo2Data, gapMs = TRIM_GAP_MS) {
    if (!spo2Data || spo2Data.length < 2) return [];

    const valid = spo2Data
        .filter(d => d[1] !== 0 && d[1] !== null && d[1] !== undefined && !Number.isNaN(d[1]))
        .sort((a, b) => a[0] - b[0]);

    if (valid.length < 2) return [];

    const gaps = [];
    for (let i = 1; i < valid.length; i++) {
        const prevTs = valid[i - 1][0];
        const curTs = valid[i][0];

        // only a single uninterrupted gap of >= 2 minutes
        if (curTs - prevTs >= gapMs) {
            gaps.push({ start: prevTs, end: curTs });
        }
    }

    // final safety check: nothing under 2 minutes gets through
    return gaps.filter(g => (g.end - g.start) >= gapMs);
}

// Add this helper above buildTrimMap
function mergeGaps(gaps) {
    if (!gaps.length) return [];

    const sorted = [...gaps].sort((a, b) => a.start - b.start);
    const merged = [{ ...sorted[0] }];

    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        const cur = sorted[i];

        // overlapping OR touching -> merge into one gap
        if (cur.start <= last.end) {
            last.end = Math.max(last.end, cur.end);
        } else {
            merged.push({ ...cur });
        }
    }

    return merged;
}

// helper function to format timestamps for display
function formatTs(ts) {
    const d = new Date(ts);
    const pad = n => String(n).padStart(2, "0");
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
//to print start and end time and gap of the session for auto trim gaps
function printAutoTrimGaps(gaps, windows = allWindows) {
    if (!gaps || !gaps.length) {
        console.log("AUTO TRIM: no gaps found in this session");
        return;
    }

    const rows = gaps.map((g, i) => {
        const win = windows.find(
            w => w.label !== "All" && g.start >= w.start && g.start <= w.end
        );
        return {
            // Window: win ? `Tab ${win.index}` : "-",
            Start: formatTs(g.start),
            End: formatTs(g.end),
            "Duration (s)": ((g.end - g.start) / 1000).toFixed(1),
            // "#": i + 1
        };
    });

    console.log(`AUTO TRIM: session ${currentSessionKey}: ${gaps.length} gap(s)`);
    console.log(rows);
}
function buildTrimMap(gaps, keepGapMs = 2000) { 
    const sortedGaps = mergeGaps(gaps);

    function toVirtual(realTimestamp) {
        let removedTime = 0;

        for (const gap of sortedGaps) {
            const gapDuration = gap.end - gap.start;
            const removable = Math.max(0, gapDuration - keepGapMs);

            if (realTimestamp <= gap.start) {
                break;
            }
            if (realTimestamp >= gap.end) {
                removedTime += removable;
            } else {
                const elapsed = realTimestamp - gap.start;
                removedTime += Math.max(0, elapsed - keepGapMs);
                break;
            }
        }

        return realTimestamp - removedTime;
    }

    function toReal(virtualTimestamp) {
        let removedTime = 0;

        for (const gap of sortedGaps) {
            const gapDuration = gap.end - gap.start;
            const removable = Math.max(0, gapDuration - keepGapMs);

            const virtualGapStart = gap.start - removedTime;

            if (virtualTimestamp <= virtualGapStart) {
                break;
            }

            removedTime += removable;
        }

        return virtualTimestamp + removedTime;
    }

    return {
        toVirtual,
        toReal,
        gaps: sortedGaps
    };
}

// Removes missing SPO2 sections from chart data
function applyTrim(data, trimMap) {
    // If trimming is not required,
    // return original data
    if (!trimMap || !data || !trimMap.gaps.length) {
        return data;
    }

    const trimmedData = [];
    data.forEach(point => {

        const timestamp = point[0];
        const value = point[1];
        // Check whether this timestamp falls inside
        // any missing SPO2 period
        const isInsideGap = trimMap.gaps.some(gap =>
            timestamp > gap.start &&
            timestamp < gap.end
        );

        // Ignore points inside missing regions
        if (isInsideGap) {
            return;
        }
        // Convert original timestamp into trimmed timeline
        trimmedData.push([
            trimMap.toVirtual(timestamp),
            value
        ]);

    });
    return trimmedData;
}

// Converts incoming API data into chart ready format
function prepareData(data) {
    if (!data || data.length === 0) {
        return [];
    }
    return data.map(point => {

        return [
            // Convert seconds timestamp into milliseconds
            normalizeTs(point[0]),

            // Convert SPO2 value into number
            Number(point[1])
        ];

    });
}
function downsample(arr) {
    if (arr.length <= MAX_POINTS) return arr;

    const sampled = [];

    const step = (arr.length - 1) / (MAX_POINTS - 1);

    for (let i = 0; i < MAX_POINTS; i++) {
        sampled.push(arr[Math.round(i * step)]);
    }

    // console.log("SAMPLE LENGTH:", sampled.length);
    return sampled;
}

function zoomIn() {

    const chart = activeChart || window.hrChart;
    if (!chart) return;
    // console.log(window.hrChart);
    // console.log(window.hrChart?.isDisposed?.());
    // console.log(window.hrChart?.getOption?.());
    const dz = chart.getOption().dataZoom[0];

    if (dz.startValue === null || dz.endValue === null)
        return;

    const center =
        (dz.startValue + dz.endValue) / 2;


    currentWindow = Math.max(
        MIN_WINDOW,
        currentWindow / 2
    );

    applyCommonZoom(
        center,
        currentWindow
    );

    isManualZoom = true
    //showResetButton(true);
}

function zoomOut() {
    isManualZoom = true
    // console.log(window.hrChart);
    // console.log(window.hrChart?.isDisposed?.());
    // console.log(window.hrChart?.getOption?.());
    const chart = activeChart || window.hrChart;
    if (!chart) return;

    const dz = chart.getOption().dataZoom[0];

    if (dz.startValue === null || dz.endValue === null)
        return;


    const center =
        (dz.startValue + dz.endValue) / 2;


    currentWindow = Math.min(
        MAX_WINDOW,
        currentWindow * 2
    );


    applyCommonZoom(
        center,
        currentWindow
    );

}
function filterWindowData(data, start, end) {

    if (!data || !data.length)
        return [];

    let windowed = getVisibleData(data, start, end);
    // console.log("Before Trim:", windowed.length);
    // console.log("Data before trim:", windowed);

    if (effectiveTrimMap && effectiveTrimMap.gaps.length) {
        windowed = applyTrim(windowed, effectiveTrimMap);
    }
    // console.log("After Trim:", windowed.length);
    // console.log("Data after trim:",windowed);
    return windowed;
}

function padGapsForSeam(gaps, keepGapMs = 2000) {
    return gaps.map(g => {
        const duration = g.end - g.start;
        if (duration <= keepGapMs) return g; // too short to shrink, leave as is
        return {
            start: g.start,
            end: g.end - keepGapMs   
        };
    });
}

let activeChart = null;
function createWindowTabs(windows, hrdata, spo2data, rrdata, rrdata1, odi3data, odi4data, savedTrim = null) {

    const container = document.getElementById("timeTabs");
    container.innerHTML = "";
    allWindows = windows;
    tabButtons = [];

    const patientId = localStorage.getItem("patient_unique_id") || "unknown";
    const firstWindow = windows.find(w => w.label !== "All") || windows[0];
    // const sessionKey = `${patientId}_${firstWindow ? firstWindow.start : "0"}`;
    //added doctorId to sessionKey to avoid trim data mixup between different doctors for the same patient
const doctorId = localStorage.getItem("docname") || "unknown";
const sessionKey = `${doctorId}_${patientId}_${firstWindow ? firstWindow.start : "0"}`;

    if (sessionKey !== currentSessionKey) {
        currentSessionKey = sessionKey;
        const allStore = getAllTrimStore();
        sessionTrimMode = typeof allStore[sessionKey] === "string" ? allStore[sessionKey] : "";
        manualTrimGaps = [];   // manual trims belong to a session, so reset on a new one
    }

    if (getSel() === "raw") {          // Raw was selected: ignore the stale session_trim
        savedTrim = null;
        sessionTrimMode = "";
        manualTrimGaps = [];
    }
        // restore the trim saved in DB (survives refresh / leaving the page)
    if (savedTrim) {
    manualTrimGaps = [];
    Object.entries(savedTrim.manual).forEach(([key, gaps]) => {
        gaps.forEach(g => manualTrimGaps.push({ start: g.start, end: g.end, chart: key }));
    });
    // DB has auto_trim -> ON. Otherwise keep the localStorage value, so a no-gap
    // session (nothing stored in DB) still remembers that the user turned it ON
    //  sessionTrimMode = savedTrim.hasAuto ? "automatic" : "";
    if (savedTrim.hasAuto) sessionTrimMode = "automatic";
}

// no trim saved for this doctor login default report is active, so switch ON
const hasSavedManual = savedTrim && Object.values(savedTrim.manual).some(g => g.length > 0);
const hasAnyTrimNow = hasSavedManual || (savedTrim && savedTrim.hasAuto) || sessionTrimMode === "automatic" || manualTrimGaps.length > 0;
setRestoreSwitch(!hasAnyTrimNow);    
    ///
    isTrimEnabled = (sessionTrimMode === "automatic");
    applyTrimButtonState(sessionTrimMode);

    const fullSpo2 = prepareData(spo2data);
    trimMap = buildTrimMap(computeSpo2Gaps(fullSpo2));
    rebuildEffectiveTrimMap();
    setDirty(false);   // current state = clean baseline

    // console.log("Detected gaps:", trimMap.gaps.length);
    // console.log("GAP:",trimMap);
    // console.log("Trim map Gap", trimMap.gaps);
    // to print auto trim gaps in console for the session
    if (isTrimEnabled) {
    printAutoTrimGaps(trimMap.gaps);
    }
    setDirty(false);
    windows.forEach((win, index) => {

        const btn = document.createElement("button");

        // const start = new Date(win.start);
        // const end = new Date(win.end);

        // btn.innerText =
        //     `${start.toLocaleTimeString('en-GB')} - ${end.toLocaleTimeString('en-GB')}`;

        // Added "all" option
        if (win.label === "All") {
            btn.innerText = "All";
        } else {
            // const start = new Date(win.start);
            // const end = new Date(win.end);

            // btn.innerText =
            //     `${start.toLocaleTimeString('en-GB')} - ${end.toLocaleTimeString('en-GB')}`;

            //removed seconds from 1 hour window
            const start = new Date(win.start);
            const end = new Date(win.end);

            const timeFmt = { hour: '2-digit', minute: '2-digit', hour12: false };

            btn.innerText =
                `${start.toLocaleTimeString('en-GB', timeFmt)} - ${end.toLocaleTimeString('en-GB', timeFmt)}`;
        }

        btn.onclick = () => {
    // user click vs. code click (first-tab auto select, ODI navigation)
    const userClick = !programmaticTabClick;
    programmaticTabClick = false;

    // clicking the already-active hour tab -> deselect, re-enable interval region
    if (userClick && btn.classList.contains("active")) {
        btn.classList.remove("active");
        hourActive = false;
        applyRegionState();
        return;
    }

    // Highlight selected button
    container.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // leaving interval mode
    hourActive = true;
    intervalActive = false;
    intervalSec = 0;
    intervalIdx = 0;
    intervalBtns.forEach(b => b.classList.remove("active"));
    applyRegionState();

    vitalCache = {
        hr: prepareData(hrdata),
        spo2: prepareData(spo2data),
        rr: prepareData(rrdata),
        rr1: prepareData(rrdata1),
        odi3: prepareData(odi3data),
        odi4: prepareData(odi4data)
    };
    // trim mode is session wide, so just keep the toggle in sync
    isTrimEnabled = (sessionTrimMode === "automatic");
    applyTrimButtonState(sessionTrimMode);
    rebuildEffectiveTrimMap(); // restore the graph data back for auto trim enabled tab

    loadWindow(
        win,
        vitalCache.hr,
        vitalCache.spo2,
        vitalCache.rr,
        vitalCache.rr1,
        vitalCache.odi3,
        vitalCache.odi4
    );
};

        container.appendChild(btn);

        tabButtons.push(btn);

        // Automatically select first window
        if (index === 0) {
            programmaticTabClick = true;
            btn.click();
        }
    });
}

// interval tabs of 2,5, 10, 15, 30, 60 minutes and all
let intervalActive = false;
let hourActive = false;
let programmaticTabClick = false;   // set when code (not the user) clicks an hour tab

function applyRegionState() {
    document.getElementById("hourRegion")
        ?.classList.toggle("region-disabled", intervalActive);
    document.getElementById("intervalRegion")
        ?.classList.toggle("region-disabled", hourActive);
}
let intervalSec = 0;      // 0 = "All"
let intervalIdx = 0;      // current chunk number
const intervalBtns = [...document.querySelectorAll("#intervalTabs button")];

function intervalCount() {
    const all = allWindows.find(w => w.label === "All");
    return all && intervalSec ? Math.ceil((all.end - all.start) / (intervalSec * 1000)) : 1;
}

function showIntervalChunk(idx) {
    const all = allWindows.find(w => w.label === "All");
    if (!all) return;

    if (!intervalSec) {                       // "All" interval tab
        intervalIdx = 0;
        isManualZoom = false;
        showResetButton(false);
        loadWindow(all, vitalCache.hr, vitalCache.spo2, vitalCache.rr,
                   vitalCache.rr1, vitalCache.odi3, vitalCache.odi4);
        return;
    }

    const len = intervalSec * 1000;
    idx = Math.max(0, Math.min(intervalCount() - 1, idx));
    intervalIdx = idx;

    const win = {
        start: all.start + idx * len,
        end: Math.min(all.end, all.start + (idx + 1) * len),
        index: idx + 1
    };

    isManualZoom = false;
    isZoomed = false;
    currentWindow = MAX_WINDOW;
    showResetButton(false);
    loadWindow(win, vitalCache.hr, vitalCache.spo2, vitalCache.rr,
               vitalCache.rr1, vitalCache.odi3, vitalCache.odi4);
}

intervalBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        if (!allWindows.length) return;

        // clicking the active interval tab again -> deselect, re-enable hour region
        if (btn.classList.contains("active")) {
            btn.classList.remove("active");
            intervalActive = false;
            intervalSec = 0;
            applyRegionState();
            updateNavigationButtons();
            return;
        }

        intervalActive = true;
        hourActive = false;
        intervalSec = Number(btn.dataset.sec);

        // highlight only this interval tab; clear the hour tabs
        intervalBtns.forEach(b => b.classList.toggle("active", b === btn));
        document.querySelectorAll("#timeTabs button").forEach(b => b.classList.remove("active"));
        applyRegionState();

        showIntervalChunk(0);
    });
});

// Click anywhere inside a greyed-out region -> unlock both regions
["hourRegion", "intervalRegion"].forEach(id => {
    const region = document.getElementById(id);
    if (!region) return;

    // capture phase: runs before the inner tab buttons see the click
    region.addEventListener("click", (e) => {
        if (!region.classList.contains("region-disabled")) return;
        if (!e.isTrusted) return;          // let code-triggered clicks (ODI navigation) through

        // e.stopPropagation();               // don't let the click hit a tab button
        // e.preventDefault();

        // release both regions and clear highlights; charts stay as they are
        hourActive = false;
        intervalActive = false;
        intervalSec = 0;
        document
            .querySelectorAll("#timeTabs button, #intervalTabs button")
            .forEach(b => b.classList.remove("active"));

        applyRegionState();
        updateNavigationButtons();
    }, true);
});

function loadWindow(win, hrdata, spo2data, rrdata, rrdata1, odi3data, odi4data) {

    selectedWindow = win;

    const isAll = win.label === "All";

    const initialZoomRange = (pendingOdiZoomTs !== null && !isAll)
        ? { start: pendingOdiZoomTs - 30000, end: pendingOdiZoomTs + 30000 }
        : null;
    const ciCard = document.getElementById("ciCard");
    if (ciCard) {
        ciCard.style.display = isAll ? "none" : "";
    }
    if (!isAll) {
        requestAnimationFrame(() => {
            getCharts().forEach(c => c.resize());
        });
    }
    const hrWindowData = filterWindowData(hrdata, win.start, win.end);
    const spo2WindowData = filterWindowData(spo2data, win.start, win.end);
    // const rrWindowData   = filterWindowData(rrdata, win.start, win.end);
    const rr1WindowData = filterWindowData(rrdata1, win.start, win.end);
    const odi3WindowData = filterWindowData(odi3data, win.start, win.end);
    const odi4WindowData = filterWindowData(odi4data, win.start, win.end);
    const rrWindowData = isAll ? [] : filterWindowData(rrdata, win.start, win.end);
    // console.log("HR WINDOW DATA LENGTH:", hrWindowData.length);
    // console.log("HR WINDOW DATA:", hrWindowData);
    // console.log("SPO2 WINDOW DATA LENGTH:", spo2WindowData.length);
    // console.log("RR WINDOW DATA LENGTH:", rr1WindowData.length);
    // console.log("CI WINDOW DATA LENGTH:", rrWindowData.length);

    if (!window.hrChart) {
        window.hrChart = createVitalChart({
            domId: "heart_rate_echart_content",
            data: hrWindowData,
            data1: [],
            data2: [],
            color: "#ffffff",
            name: "HR",
            zoomRange: initialZoomRange
        });

    }

    if (!window.spo2Chart) {
        window.spo2Chart = createVitalChart({
            domId: "spo2_echart_content",
            data: spo2WindowData,
            data1: odi3WindowData,
            data2: odi4WindowData,
            color: "#ffffff",
            name: "SPO2",
            zoomRange: initialZoomRange
        });
    }

    //Chest Impedance
    // if (!window.rrChart) {
    if (!isAll && !window.rrChart) {
        window.rrChart = createVitalChart({
            domId: "respiration_rate_echart_content",
            data: rrWindowData,
            data1: [],
            data2: [],
            color: "#ffffff",
            name: "CI",
            zoomRange: initialZoomRange
        });
    }

    // Respiration Rate
    if (!window.rrChart1) {
        window.rrChart1 = createVitalChart({
            domId: "resp_rate_echart_content",
            data: rr1WindowData,
            data1: [],
            data2: [],
            color: "#ffffff",
            name: "RR",
            zoomRange: initialZoomRange
        });


    }

    echarts.connect("vitalsGroup");
    [
        window.hrChart,
        window.spo2Chart,
        window.rrChart,
        window.rrChart1
        // ].forEach(chart=>{
        //     chart.group="vitalsGroup";
        // });
    ].filter(Boolean).forEach(chart => {
        chart.group = "vitalsGroup";
    });


    if (isAll) {

        updateVitalChart(window.hrChart,
            hrWindowData,
            [],
            []);

        updateVitalChart(window.spo2Chart,
            spo2WindowData,
            odi3WindowData,
            odi4WindowData);

        updateVitalChart(window.rrChart1,
            rr1WindowData,
            [],
            []);

    }
    else {
        updateVitalChart(window.hrChart, hrWindowData, [], [], initialZoomRange);
        updateVitalChart(window.spo2Chart, spo2WindowData, odi3WindowData, odi4WindowData, initialZoomRange);
        // updateVitalChart(window.rrChart, rrWindowData, [], []);
        if (window.rrChart) {
            updateVitalChart(window.rrChart, rrWindowData, [], [], initialZoomRange);
        }
        updateVitalChart(window.rrChart1, rr1WindowData, [], [], initialZoomRange);

    }
    // same x range on every chart, so a trim box maps to the same pixels on all four
    const xMin = effectiveTrimMap ? effectiveTrimMap.toVirtual(win.start) : win.start;
    const xMax = effectiveTrimMap ? effectiveTrimMap.toVirtual(win.end) : win.end;
    getCharts().forEach(c => c.setOption({ xAxis: { min: xMin, max: xMax } }));
    requestAnimationFrame(() => getCharts().forEach(c => c.resize()));
    updateNavigationButtons();
    refreshSaveBtn(); 

    if (pendingOdiZoomTs !== null && !isAll) {
        const zoomTs = pendingOdiZoomTs;
        pendingOdiZoomTs = null;

        requestAnimationFrame(() => {
            zoomAllCharts(zoomTs);
        });
    }
}

function updateVitalChart(chart, data, data1 = [], data2 = [], zoomRange = null) {

    const normalizeTs = ts => Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);

    const lineData = downsample(
        data.map(d => [normalizeTs(d[0]), Number(d[1])])
    );
    // console.log("[RENDER] chart:", chart === window.hrChart ? "HR" : chart === window.spo2Chart ? "SPO2" : chart === window.rrChart ? "CI" : "RR",
    //     "lineData length:", lineData.length,
    //     "min ts:", lineData.length ? new Date(lineData[0][0]).toLocaleTimeString() : null,
    //     "max ts:", lineData.length ? new Date(lineData[lineData.length-1][0]).toLocaleTimeString() : null
    // );
    const scatter1 = [];
    data1.forEach(item => {
        const arr = Array.isArray(item[0]) ? item[0] : [item[0]];
        arr.forEach(ts => scatter1.push([normalizeTs(ts), item[1]]));
    });

    const scatter2 = [];
    data2.forEach(item => {
        const arr = Array.isArray(item[0]) ? item[0] : [item[0]];
        arr.forEach(ts => scatter2.push([normalizeTs(ts), item[1]]));
    });

    //    console.log(
    //     `[${chart === window.hrChart ? "HR" : chart === window.spo2Chart ? "SPO2" : chart === window.rrChart ? "CI" : "RR"}] plotting points:`,
    //     lineData.length, "scatter1:", scatter1.length, "scatter2:", scatter2.length
    // );

    if (lineData == undefined) return;
    chart.__rawData = lineData;

    const values = lineData.map(x => x[1]).filter(v => v !== 0);

    // const minY = values.length ? Math.min(...values) : 0;
    // const maxY = values.length ? Math.max(...values) : 100;
    const scatterVals = [...scatter1, ...scatter2].map(p => p[1]).filter(v => v != null);
    const allVals = [...values, ...scatterVals];
    const minY = allVals.length ? Math.min(...allVals) : 0;
    const maxY = allVals.length ? Math.max(...allVals) : 100;

    chart.__scatterData = [...scatter1, ...scatter2];   // used by updateYAxis

    const hasODI3 = scatter1.length > 0;
    const hasODI4 = scatter2.length > 0;

    chart.setOption({
        legend: {
            show:
                chart === window.spo2Chart &&
                (hasODI3 || hasODI4),
            data: ["ODI3", "ODI4"]
        },

        yAxis: {
            min: minY - 5,
            max: maxY + 5
        },

        series: [
            {
                data: lineData.map(([t, v]) => [t, v === 0 ? null : v])
            },
            {
                data: scatter1
            },
            {
                data: scatter2
            }
        ],
        // dataZoom: [
        //     {
        //         start: 0,
        //         end: 100
        //     },
        //     {
        //         start: 0,
        //         end: 100
        //     }
        // ]
        dataZoom: zoomRange
            ? [
                { startValue: zoomRange.start, endValue: zoomRange.end },
                { startValue: zoomRange.start, endValue: zoomRange.end }
            ]
            : [
                { start: 0, end: 100 },
                { start: 0, end: 100 }
            ]
    }, false);
    setNoData(chart, lineData.length === 0 && scatter1.length === 0 && scatter2.length === 0);
}


function createTimeWindows(data, startTime, endTime) {
    //   console.log("start windows time", data, ":" +   startTime, ":" + endTime);
    if (!data || data.length === 0)
        return [];

    const windows = [];

    // const startTime = Number(data[0][0]);
    // const endTime = Number(data[data.length - 1][0]);

    //const totalDuration = endTime - startTime;

    // Number of 2-hour windows required
    // const tabCount = Math.ceil(data / TAB);

    //console.log("Total duration(ms):", totalDuration);
    // console.log("Number of tabs:", tabCount);



    const totalDuration = Number(endTime) - Number(startTime);
    // TAB = 60 * 60 (1 hour in seconds)
    // console.log("TotalDuration:",totalDuration);

    const tabCount = Math.ceil(totalDuration / TAB);
    // console.log("Tab Count:", tabCount);

    for (let i = 0; i < tabCount; i++) {

        let windowStart = Number(startTime) + (i * (TAB));

        let windowEnd = windowStart + (TAB);

        if (windowEnd > Number(endTime)) {
            windowEnd = endTime;
        }
        //  console.log("WINDOW START:",windowStart);
        //  console.log("WINDOW END:", windowEnd);

        windows.push({
            start: windowStart * 1000,
            end: windowEnd * 1000,
            index: i + 1
        });
    }

    // Add Complete Session window
    windows.push({
        start: Number(startTime) * 1000,
        end: Number(endTime) * 1000,
        index: 0,
        label: "All"
    });

    return windows;
}



function getVisibleData(data, start, end) {

    let left = 0;
    let right = data.length - 1;

    while (left <= right) {
        let mid = (left + right) >> 1;

        if (data[mid][0] < start)
            left = mid + 1;
        else
            right = mid - 1;
    }

    const startIndex = left;


    left = 0;
    right = data.length - 1;

    while (left <= right) {
        let mid = (left + right) >> 1;

        if (data[mid][0] <= end)
            left = mid + 1;
        else
            right = mid - 1;
    }

    return data.slice(startIndex, right + 1);
}
function getCharts() {
    return [
        window.hrChart,
        window.spo2Chart,
        window.rrChart,
        window.rrChart1
    ].filter(chart => chart && !chart.isDisposed());
}
let selectedWindow = null;
let ignoreZoomEvent = false;


let isManualZoom = false;

function setNoData(chart, show) {
    const el = chart.getDom();
    let o = el.querySelector(":scope > .nodata-overlay");
    if (!o) {
        o = document.createElement("div");
        o.className = "nodata-overlay";
        o.textContent = "No Data Available";
        o.style.cssText =
            "position:absolute;left:0;top:0;right:0;bottom:0;display:flex;" +
            "align-items:center;justify-content:center;color:#999;font-size:18px;" +
            "font-weight:bold;pointer-events:none;z-index:10;";
        el.appendChild(o);
    }
    o.style.display = show ? "flex" : "none";
}

function createVitalChart({
    domId,
    data,
    data1,
    data2,
    color,
    name,
    zoomRange = null
}) {


    const hasData =
        (data && data.length) ||
        (data1 && data1.length) ||
        (data2 && data2.length);
    const el = document.getElementById(domId);


    let chart = echarts.getInstanceByDom(el);

    if (!chart) {
        chart = echarts.init(el, null, {
            renderer: "canvas",
            useDirtyRect: false // to show both odi events changed this from true to false
        });
    }
    const normalizeTs = (ts) => {
        ts = Number(ts);
        return ts < 1e12 ? ts * 1000 : ts;
    };
    const rawSeriesData = data.map(d => [
        normalizeTs(Number(d[0])),
        Number(d[1])
    ]);
    const seriesData = downsample(data);
    let seriesData1 = [];
    let seriesData2 = [];

    if (data1) {
        data1.forEach(item => {
            const rawTimestamps = item[0];
            const value = item[1];

            if (!rawTimestamps) return;

            const timestampsArray = Array.isArray(rawTimestamps)
                ? rawTimestamps
                : [rawTimestamps];

            timestampsArray.forEach(ts => {
                if (ts !== undefined && ts !== null && ts !== "") {
                    seriesData1.push([ts, value]);
                }
            });
        });
    }
    // console.log("seriesData1",seriesData1)
    if (data2) {
        data2.forEach(item => {
            const rawTimestamps = item[0];
            const value = item[1];

            if (!rawTimestamps) return;

            const timestampsArray = Array.isArray(rawTimestamps)
                ? rawTimestamps
                : [rawTimestamps];

            timestampsArray.forEach(ts => {
                if (ts !== undefined && ts !== null && ts !== "") {
                    seriesData2.push([ts, value]);
                }
            });
        });
    }
    //console.log("data",typeof seriesData[0][1], seriesData[0][1]);
    const hasODI3 = seriesData1.length > 0;
    const hasODI4 = seriesData2.length > 0;

    const legendData = [];

    if (hasODI3) {
        legendData.push({
            name: "ODI3",
            icon: "image://https://svasthyahealth.com/cmc-pediatrics1/production/images/down-blue.png"
        });
    }

    if (hasODI4) {
        legendData.push({
            name: "ODI4",
            icon: "image://https://svasthyahealth.com/cmc-pediatrics1/production/images/down-red.png"
        });
    }
    const values = seriesData.map(item => item[1]);
    const nonZeroValues = values.filter(v => v !== 0);
    const minY = nonZeroValues.length ? Math.min(...nonZeroValues) : 0;
    const maxY = nonZeroValues.length ? Math.max(...nonZeroValues) : 100;
    const latestTs = seriesData[seriesData.length - 1]?.[0] || 0;
    const option = {
        // graphic: !hasData
        //     ? {
        //         type: 'text',
        //         left: 'center',
        //         top: 'middle',
        //         style: {
        //             text: 'No Data Available',
        //             fill: '#999',
        //             fontSize: 18,
        //             fontWeight: 'bold'
        //         }
        //     }
        //     : null,
        tooltip: {
            trigger: "axis",
            appendToBody: true,                          // new: not clipped by the chart or covered by other rows
            extraCssText: "z-index:99999;",   
            axisPointer: {
                type: "cross"
            },
            formatter: function (params) {
                // Remove scatter series from tooltip
                // const filtered = params.filter(item => item.seriesType !== "scatter");
                 const filtered = params.filter(
        item => item.seriesType !== "scatter" && item.value
    );

                if (!filtered.length) {
                    return "";
                }

                // let result = echarts.format.formatTime(
                //   "yyyy-MM-dd hh:mm:ss",
                //   filtered[0].value[0]
                // );

                // automatic trim
                const rawTs = filtered[0].value[0];
                const realTs = effectiveTrimMap ? effectiveTrimMap.toReal(rawTs) : rawTs;
                let result = echarts.format.formatTime(
                    "yyyy-MM-dd hh:mm:ss",
                    realTs
                );

                filtered.forEach(item => {

                    let value = item.value[1];

                    if (value === null || value === undefined || value === "") {
                        value = "--";
                    }

                    result += `<br/>${item.marker}${item.seriesName}: ${value}`;
                });

                return result;
            }
        },

        grid: {
            left: 60,
            right: 20,
            top: 22,                              // just enough for the overlay label / ODI legend
            bottom: name === "RR" ? 44 : 6,       // charts 1-3 have no x labels, so almost no bottom space
            containLabel: false,
        },

        toolbox: {

            top: 2,
            right: 15,
            itemSize: 24,
            feature: {
                myTool1: {
                    show: false,
                    title: "Reset",
                    color: "#ffff",
                    icon: "image://https://svasthyahealth.com/cmc-pediatrics1/production/images/backicon.png",
                    //icon: "path://M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 768c-176.7 0-320-143.3-320-320S335.3 192 512 192c88.4 0 168.4 35.8 226.3 93.7L640 384h256V128l-67.2 67.2C747.6 114 635.3 64 512 64z",
                    onclick: function () {
                        resetAllCharts();
                    }
                }
            }
        },

        // xAxis: {
        //     type: "time",
        //     splitLine: {
        //         show: false
        //     },
        //     //   axisLabel: {
        //     //     color: "#fff",
        //     //     rotate: 40,
        //     //     formatter: function (value) {
        //     //       const d = new Date(value);
        //     // auto trim
        //     axisLabel: {
        //         show: name === "RR",
        //         color: "#fff",
        //         rotate: 40,
        //         // formatter: function (value) {
        //         //   const real = (isTrimEnabled && trimMap) ? trimMap.toReal(value) : value; // ADDED
        //         //   const d = new Date(real);
        //         formatter: function (value) {
        //             const real = effectiveTrimMap ? effectiveTrimMap.toReal(value) : value;
        //             const d = new Date(real);

        //             return (
        //                 // `${d.getDate()}-${d.getMonth() + 1}` +
        //                 `\n${String(d.getHours()).padStart(2, "0")}:` +
        //                 `${String(d.getMinutes()).padStart(2, "0")}:` +
        //                 `${String(d.getSeconds()).padStart(2, "0")}`
        //             );
        //         }
        //     }
        // },
        xAxis: {
            type: "time",
            splitLine: {
                show: false
            },
            axisTick: {
                show: name === "RR" 
            },
            axisLabel: {
                show: name === "RR",
                color: "#fff",
                rotate: 0,                        // was 40: rotated labels need about 35px, flat ones about 16px
                margin: 6,
                formatter: function (value) {
                    const real = effectiveTrimMap ? effectiveTrimMap.toReal(value) : value;
                    const d = new Date(real);
                    return (
                        `${String(d.getHours()).padStart(2, "0")}:` +   // removed the leading "\n"
                        `${String(d.getMinutes()).padStart(2, "0")}:` +
                        `${String(d.getSeconds()).padStart(2, "0")}`
                    );
                }
            }
        },
        yAxis: {
            type: "value",
            min: minY - 3,
            max: maxY + 3,
            splitLine: {
                show: false
            },
            //show:true,
            axisLabel: {
                color: "#fff",
                // show: name === "RR" ? true : true,
                show: name !== "CI",  // to hide y-axis for CI chart
            }

        },

        //   dataZoom:[
        //     {
        //         type:"inside",
        //         throttle: 50,
        //         filterMode:"none",
        //         start:0,
        //         end:100
        //     },
        //     {
        //         type:"slider",
        //         throttle: 50,
        //         filterMode:"none",
        //         start:0,
        //         end:100
        //     }
        // ],
        dataZoom: [
            {
                type: "inside",
                throttle: 50,
                filterMode: "none",
                minValueSpan: MIN_WINDOW, // to keep zoom in max to 30 seconds in charts
                moveOnMouseMove: false,   // stop drag-pan so our rect-select works
                zoomOnMouseWheel: true,
                ...(zoomRange ? { startValue: zoomRange.start, endValue: zoomRange.end } : { start: 0, end: 100 })
            },
            {
                type: "slider",
                show: name === "RR",
                height: 16,            // was ~30 (default)
                bottom: 4,
                showDetail: true, 
                throttle: 50,
                filterMode:"none",
                minValueSpan: MIN_WINDOW, // to keep zoom in max to 30 seconds in charts
                ...(zoomRange ? { startValue: zoomRange.start, endValue: zoomRange.end } : { start: 0, end: 100 })
            }
        ],
        legend: {
            show: name === "SPO2" && (hasODI3 || hasODI4),
            top: 1,
            left: "center",
            textStyle: {
                color: "#fff"
            },
            selectedMode: false,
            // data: legendData
            data:["ODI3","ODI4"],  // Alignment: 'center', 'left', 'right'
        },
        series: [
            {
                name,
                type: "line",
                data: seriesData.map(([time, value]) => [
                    time,
                    value === 0 ? null : value]),
                connectNulls:false,
                progressive:4000,
                progressiveThreshold:10000,
                smooth: true,
                showSymbol: false,
                large:true,
                largeThreshold:5000,
                lineStyle: {
                    color,
                    width: 2
                }
            },

            {
                name: `ODI3`,
                type: "scatter",
                data: seriesData1,
                symbolSize: 20,
                //symbol:"circle",
                symbol:"image://https://svasthyahealth.com/cmc-pediatrics1/production/images/down-blue.png",
                cursor: "pointer",
                itemStyle: {
                    color: "red"
                }
            },

            {
                name: `ODI4`,
                type: "scatter",
                data: seriesData2,
                symbolSize: 20,
                symbol: "image://https://svasthyahealth.com/cmc-pediatrics1/production/images/down-red.png",
                cursor: "pointer",
                itemStyle: {
                    color: "blue"
                }
            }
        ]
    };
    setNoData(chart, !hasData);
    // chart.clear()
    //changed this to remove coordinate system error when no data is available
    // if (!seriesData.length) {
    //     showNoData(domId)
    // }
    // else {
    //     //  console.log("setting option", chart , option)
    //     //chart.setOption(option);
    //     chart.setOption(option, {
    //         notMerge: true,
    //         lazyUpdate: true,
    //         animation: false
    //     });
    // }
    chart.setOption(option, {
    notMerge: true,
    lazyUpdate: true,
    animation: false
    });
    chart.off("dataZoom");
    chart.off("click");

    // ================================
    // MANUAL TRIM PORTION SELECT BOX
    // ================================
    chart.getZr().on("mousedown", function (e) {
        const sliderModel = chart.getModel().getComponent("dataZoom", 1);

        if (sliderModel) {
            const dzBottom = sliderModel.get("bottom");
            const dzHeight = sliderModel.get("height");
            const resolvedBottom = (typeof dzBottom === "number") ? dzBottom : 0;
            const resolvedHeight = (typeof dzHeight === "number") ? dzHeight : 20;
            const sliderTop = chart.getHeight() - resolvedBottom - resolvedHeight;
            if (e.offsetY >= sliderTop) return;
        }

        const gridRect = chart.getModel().getComponent("grid", 0).coordinateSystem.getRect();

        if (
            e.offsetX < gridRect.x ||
            e.offsetX > gridRect.x + gridRect.width ||
            e.offsetY < gridRect.y ||
            e.offsetY > gridRect.y + gridRect.height
        ) {
            return;
        }

        removeTrimPopup();                 // hide the button while dragging
        trimRectChart = chart;             // the chart the drag started on

        trimStart = {
            x: e.offsetX,
            gridMinX: gridRect.x,
            gridMaxX: gridRect.x + gridRect.width
        };

        // one draft box on EVERY visible chart
        removeShapeList(draftShapes);
        draftShapes = [];
        getTrimCharts().forEach(c => {
            const r = c.getModel().getComponent("grid", 0).coordinateSystem.getRect();
            const s = makeSelectionShapes(trimStart.x, trimStart.x, r.y, r.height);
            addShapes(c, s);
            draftShapes.push({ chart: c, s, top: r.y, height: r.height });
        });
    });

    chart.getZr().on("mousemove", function (e) {
        if (!trimStart || !draftShapes) return;

        const clampedX = Math.min(trimStart.gridMaxX, Math.max(trimStart.gridMinX, e.offsetX));

        draftShapes.forEach(({ s, top, height }) => {
            s.fill.setShape({
                x: Math.min(trimStart.x, clampedX),
                y: top,
                width: Math.abs(clampedX - trimStart.x),
                height
            });
            s.endLine.setShape({
                x1: clampedX, y1: top,
                x2: clampedX, y2: top + height
            });
        });
    });

    chart.getZr().on("mouseup", function (e) {
        if (!trimStart) return;

        const clampedX = Math.min(trimStart.gridMaxX, Math.max(trimStart.gridMinX, e.offsetX));
        const startPixel = Math.min(trimStart.x, clampedX);
        const endPixel = Math.max(trimStart.x, clampedX);

        removeShapeList(draftShapes);
        draftShapes = null;
        trimStart = null;

        // ignore accidental clicks (no real drag), keep earlier selections
        if (endPixel - startPixel < 4) return;

    const rawStart = chart.convertFromPixel({ xAxisIndex: 0 }, startPixel);
    const rawEnd = chart.convertFromPixel({ xAxisIndex: 0 }, endPixel);

    const startTime = effectiveTrimMap ? effectiveTrimMap.toReal(rawStart) : rawStart;
    const endTime = effectiveTrimMap ? effectiveTrimMap.toReal(rawEnd) : rawEnd;

    // Add to the list instead of replacing
    // merge with any pending range that overlaps or touches the new one
    let mergedStart = startTime;
    let mergedEnd = endTime;
    pendingRanges = pendingRanges.filter(r => {
        if (r.start <= mergedEnd && r.end >= mergedStart) {
            mergedStart = Math.min(mergedStart, r.start);
            mergedEnd = Math.max(mergedEnd, r.end);
            removeShapeList(r.shapes);
            return false;
        }
        return true;
    });
    pendingRanges.push({ start: mergedStart, end: mergedEnd, shapes: [] });

    console.log(`MANUAL TRIM SELECT #${pendingRanges.length} →`,
        formatTs(mergedStart), "-", formatTs(mergedEnd));

    redrawPendingRanges();

    showManualTrimPopup(chart, (startPixel + endPixel) / 2);
});

    chart.off("finished");
chart.on("finished", function () {
    refreshTrimSelections();   // boxes live on all charts now
});

    //zoom
    chart.on("dataZoom", function (params) {
        activeChart = chart;

    // redraw boxes immediately, even for programmatic zooms (ignoreZoomEvent)
    // and regardless of which connected chart fired the event
        refreshTrimSelections();

        if (ignoreZoomEvent) return;
        isManualZoom = true;

        if (zoomRafScheduled) return;
        zoomRafScheduled = true;
        requestAnimationFrame(() => {
            zoomRafScheduled = false;
            updateYAxis(chart);
            updateNavigationButtons();
            showResetButton(true);
            refreshTrimSelections();   // again after the y-axis/grid may have changed
        });
    });
    // chart.on("dataZoom", function (params) {
    //     activeChart = chart;
    //     if (ignoreZoomEvent) return;
    //     isManualZoom = true;

    //     const b = params.batch ? params.batch[0] : params;   
    //     const dz = { startValue: b.startValue, endValue: b.endValue }; 

    //     if (zoomRafScheduled) return;
    //     zoomRafScheduled = true;
    //     requestAnimationFrame(() => {
    //         zoomRafScheduled = false;
    //         updateYAxis(chart, dz);   
    //         updateNavigationButtons();
    //         showResetButton(true);
    //     });
    // });
    //  
    chart.on("click", function (params) {

        if (params.componentType !== "series") return;
        if (params.seriesType !== "scatter") return;

        //     const ts = params?.value?.[0];
        //    // console.log("ts click",ts)
        //     if (!ts) return;

        //     zoomAllCharts(ts);
        const ts = params?.value?.[0];
        // console.log("ts click",ts)
        if (!ts) return;

        if (selectedWindow && selectedWindow.label === "All") {
            navigateToOdiEvent(ts);
            return;
        }

        zoomAllCharts(ts);
    });

    chart.__rawData = seriesData;
    return chart;
}

// function navigateToOdiEvent(ts) {

//     const targetWindow = allWindows.find(
//         w => w.label !== "All" && ts >= w.start && ts <= w.end
//     );
// auto trim
function navigateToOdiEvent(ts) {

    const realTs = effectiveTrimMap ? effectiveTrimMap.toReal(ts) : ts;

    const targetWindow = allWindows.find(
        w => w.label !== "All" && realTs >= w.start && realTs <= w.end
    );

    const targetIndex = targetWindow ? allWindows.indexOf(targetWindow) : -1;

    if (targetIndex === -1 || !tabButtons[targetIndex]) {
        zoomAllCharts(ts);
        return;
    }

    pendingOdiZoomTs = ts;
    programmaticTabClick = true;  
    tabButtons[targetIndex].click();
}
window.addEventListener("resize", () => {

    requestAnimationFrame(() => {

        getCharts()
            .forEach(chart => chart.resize());

    });

});


// function updateYAxis(chart) {
function updateYAxis(chart, dz) {
    dz = dz || chart.getOption().dataZoom[0];
    //
    const option = chart.getOption();

    //const xRange = option.xAxis?.[0];

    // console.log(window.hrChart);
    // console.log(window.hrChart?.isDisposed?.());
    // console.log(window.hrChart?.getOption?.());
    //  const dz = chart.getOption().dataZoom[0];

    if (!dz) return;

    const data = chart.__rawData || [];

    if (!chart.__rawData || chart.__rawData.length === 0) {
        return;
    }

    // get visible range in timestamp
    // const startPercent = dz.start / 100;
    // const endPercent = dz.end / 100;

    // const startIndex = Math.floor(data.length * startPercent);
    // const endIndex = Math.floor(data.length * endPercent);

    // const visible = data.slice(startIndex, endIndex);
    let visible = [];

    if (dz.startValue != null && dz.endValue != null) {
        visible = getVisibleData(
            data,
            dz.startValue,
            dz.endValue
        );
    } else {
        const startIndex = Math.floor((dz.start / 100) * data.length);
        const endIndex = Math.ceil((dz.end / 100) * data.length);
        visible = data.slice(startIndex, endIndex);
    }

    if (!visible.length) return;

    // const values = visible.map(d => d[1]).filter(v => v != null && v !== 0);
    const scatterVals = (chart.__scatterData || [])
    .filter(p => dz.startValue == null || (p[0] >= dz.startValue && p[0] <= dz.endValue))
    .map(p => p[1])
    .filter(v => v != null);

const values = visible.map(d => d[1]).filter(v => v != null && v !== 0).concat(scatterVals);
    if (!values.length) return;

    const minY = Math.min(...values);
    const maxY = Math.max(...values);
    const padding = 5//Math.max((maxY - minY) * 0.2, 2);

    chart.setOption({

        yAxis: {
            min: minY - padding,
            max: maxY + padding,
            axisLabel: {
                // show: true//chart == window.rrChart
                 show: chart !== window.rrChart // to hide y-axis label for CI chart
            }
        }
    });
    // console.log(chart.getOption().dataZoom[0]);

}



function moveZoomWindow(direction) {

    if (!isManualZoom) return;

    const charts = getCharts().filter(c => c.__rawData && c.__rawData.length);
    const chart = charts.includes(activeChart) ? activeChart : charts[0];
    if (!chart || !selectedWindow) return;

    // read the real visible range from the x-axis (not from dataZoom options)
    const [curStart, curEnd] = chart.getModel().getComponent("xAxis", 0).axis.scale.getExtent();
    const zoomSize = curEnd - curStart;

    let start = direction === "next" ? curStart + zoomSize : curStart - zoomSize;
    let end   = direction === "next" ? curEnd   + zoomSize : curEnd   - zoomSize;

    const winStart = effectiveTrimMap ? effectiveTrimMap.toVirtual(selectedWindow.start) : selectedWindow.start;
    const winEnd = effectiveTrimMap ? effectiveTrimMap.toVirtual(selectedWindow.end)   : selectedWindow.end;
    if (start < winStart) {
        start = winStart;
        end = start + zoomSize;
    }
    if (end > winEnd)     { end = winEnd;     start = end - zoomSize; }

    ignoreZoomEvent = true;

    // ONE dispatch only; echarts.connect("vitalsGroup") moves the other charts
    chart.dispatchAction({
        type: "dataZoom",
        dataZoomIndex: 0,
        startValue: start,
        endValue: end,
        animation: false
    });

    requestAnimationFrame(() => {
        charts.forEach(c => updateYAxis(c));
        ignoreZoomEvent = false;
        updateNavigationButtons();
    });
}
/* ---------------------------------------
   ZOOM ALL CHARTS
---------------------------------------- */
function zoomAllCharts(centerTs) {

    console.log("ts for zoom", centerTs)
    const range = 30 * 1000; // milliseconds

    const start = centerTs - range;
    const end = centerTs + range;

    const charts = getCharts();

    ignoreZoomEvent = true;

    charts.forEach(chart => {
        if (!chart.__rawData || chart.__rawData.length === 0) {
            return;
        }

        chart.dispatchAction({
            type: "dataZoom",
            startValue: start,
            endValue: end
        });

    });

    requestAnimationFrame(() => {

        isZoomed = true;
        isManualZoom = true;

        charts.forEach(chart => {
            updateYAxis(chart);
        });

        showResetButton(true);
        updateNavigationButtons();

        ignoreZoomEvent = false;

    });
}

// auto trim
const trimModeSelects = [
    document.getElementById("trimModeGlobal")
].filter(Boolean);

// Helper to reflect a mode ("" = off, "automatic" = on) onto the switch
function applyTrimButtonState(mode) {
    trimModeSelects.forEach(input => {
        input.dataset.mode = mode;
        input.checked = (mode === "automatic");
    });
}

trimModeSelects.forEach(input => {
    // input.addEventListener("change", () => {
        input.addEventListener("change", async () => {
        const wasDefault = isDefaultActive(); 
        const mode = input.checked ? "automatic" : "";

        sessionTrimMode = mode;
        applyTrimButtonState(mode);

        isTrimEnabled = (mode === "automatic");
        savedAutoGaps = null;
        rebuildEffectiveTrimMap();
        if (isTrimEnabled) setRestoreSwitch(false);
        
        if (isTrimEnabled && trimMap) {
            printAutoTrimGaps(trimMap.gaps);
        }

const autoHasGaps = !!(trimMap && trimMap.gaps.length > 0);

// await so the baseline is captured before the save
// await notifyTrimChange(hasAnyTrim(), isTrimEnabled && autoHasGaps);
await notifyTrimChange(hasAnyTrim(), isTrimEnabled ? autoHasGaps : hasAnyTrim());

// save AFTER the baseline is captured
if (autoTrimSaveHandler && !(wasDefault && !isTrimEnabled)) {
    autoTrimSaveHandler(isTrimEnabled && trimMap ? trimMap.gaps : null, wasDefault);
}

        const allStore = getAllTrimStore();
        allStore[currentSessionKey] = mode;
        saveTrimStore(allStore);

        if (selectedWindow) {
            loadWindow(
                selectedWindow,
                vitalCache.hr,
                vitalCache.spo2,
                vitalCache.rr,
                vitalCache.rr1,
                vitalCache.odi3,
                vitalCache.odi4
            );
        }
    });
});
///
const filesDropdown = document.getElementById("filesDropdown");

// Keeps the dropdown in sync when the code changes trim state itself.
// on = true  -> default report is showing -> select "Raw"
// on = false -> a trim was applied -> leave the dropdown as is
function setRestoreSwitch(on) {
    if (filesDropdown && on) filesDropdown.value = "raw";
}

//progress bar when loading default data when restore default report is clicked
function showBusy(text) {
    let el = document.getElementById("restoreBusy");
    if (!el) {
        el = document.createElement("div");
        el.id = "restoreBusy";
        el.style.cssText = `
            position:fixed; top:0; left:0; right:0; bottom:0;
            z-index:100000; margin:0; padding:0;
            background:rgba(0,0,0,0.55); color:#fff; font-size:15px;
        `;
        el.innerHTML = `
            <!-- spinner: exact center of the screen -->
            <div style="position:absolute; top:50%; left:50%;
                        width:60px; height:60px; margin:-30px 0 0 -30px;
                        box-sizing:border-box;
                        border:10px solid #de5935; border-top-color:#f7cd46;
                        border-radius:50%;
                        animation:loading 0.75s ease infinite;"></div>

            <!-- text: placed below the spinner, does not affect its position -->
            <div class="rb-text"
                 style="position:absolute; top:50%; left:0; right:0;
                        margin-top:50px; text-align:center;"></div>
        `;
        document.documentElement.appendChild(el);
    }
    el.querySelector(".rb-text").textContent = text;
    el.style.display = "block";
    void el.offsetHeight;   // force paint before heavy work
}
function hideBusy() {
    const el = document.getElementById("restoreBusy");
    if (el) el.style.display = "none";
}

async function runWithLoader(text, task) {
    showBusy(text);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
        return await task();
    } finally {
        try { hideBusy(); } catch (e) { console.error(e); }
    }
}
// Apply a saved file: its trims + its stored report (no writes to session_trim)
async function loadSavedFileView(fileId) {
    if (!loadFileHandler) return;
    const f = await loadFileHandler(fileId);
    if (!f) throw new Error("Saved file not found");

    clearTrimSelection();
    manualTrimGaps = [];
    Object.entries(f.trim.manual).forEach(([key, gaps]) => {
        gaps.forEach(g => manualTrimGaps.push({ start: g.start, end: g.end, chart: key }));
    });
    sessionTrimMode = f.trim.hasAuto ? "automatic" : "";
    isTrimEnabled = (sessionTrimMode === "automatic");
    savedAutoGaps = (f.trim.autoGaps && f.trim.autoGaps.length) ? f.trim.autoGaps : null;
    applyTrimButtonState(sessionTrimMode);
    rebuildEffectiveTrimMap();

    if (paintSavedHandler) paintSavedHandler(f.analysis);

    isManualZoom = false; isZoomed = false; currentWindow = MAX_WINDOW;
    if (selectedWindow) {
        loadWindow(selectedWindow, vitalCache.hr, vitalCache.spo2, vitalCache.rr,
                   vitalCache.rr1, vitalCache.odi3, vitalCache.odi4);
    }
    showResetButton(false);
    updateNavigationButtons();
    setDirty(false);
}

// export async function refreshFilesDropdown(selectId) {
export async function refreshFilesDropdown(selectId, apply = false) {
    if (!filesDropdown || !listFilesHandler) return;
    const files = await listFilesHandler();
    // const keep = selectId || filesDropdown.value || "raw";
   const keep =
    selectId ||
    getSel() ||
    (files[0] && files[0].id) ||
    "raw"; //last saved file id or "raw" if no files exist
    "raw"; // last saved file last in dropdown or "raw" if no files exist

    filesDropdown.innerHTML = "";
    const raw = document.createElement("option");
    raw.value = "raw"; raw.textContent = "Raw Data";
    filesDropdown.appendChild(raw);

    files.forEach(f => {
        const o = document.createElement("option");
        o.value = f.id;
        o.textContent = `${f.file_name}  \u00A0—\u00A0  ${f.doctor_name || ""}`;
        // o.textContent = `${f.file_name}  \u00A0Saved by: ${f.doctor_name || ""}`;
        filesDropdown.appendChild(o);
    });
    filesDropdown.value = [...filesDropdown.options].some(o => o.value === keep) ? keep : "raw";
    filesDropdown.dataset.prev = filesDropdown.value;
    // localStorage.setItem("lastTrimmedFileId", filesDropdown.value);
    setSel(filesDropdown.value);  
    refreshSaveBtn();   
    if (apply && filesDropdown.value !== "raw") {
        try {
            await runWithLoader("Loading saved file…", () => loadSavedFileView(filesDropdown.value));
        } catch (e) { console.error(e); }
    }
}

// ---------- Save ----------

filesDropdown?.addEventListener("mousedown", () => {
    if (filesDropdown.value === "raw" && hasAnyTrim()) filesDropdown.selectedIndex = -1;
});
filesDropdown?.addEventListener("blur", () => {
    if (filesDropdown.selectedIndex === -1) filesDropdown.value = filesDropdown.dataset.prev || "raw";
});

filesDropdown?.addEventListener("change", async () => {
    const selected = filesDropdown.value;
    const previous = filesDropdown.dataset.prev || "raw";

    if (selected === previous && !(selected === "raw" && hasAnyTrim())) return;

    if (!(await guardUnsaved())) {            // popup only when isDirty()
        filesDropdown.value = previous;       // No -> stay
        return;
    }

    filesDropdown.disabled = true;            // Yes -> discard and continue
    try {
        if (selected === "raw") {
            await runWithLoader("Restoring raw data…", resetTrimToDefault);
        } else {
            await runWithLoader("Loading saved file…", () => loadSavedFileView(selected));
        }
        filesDropdown.dataset.prev = selected;
//         if (selected === "raw") {
//     localStorage.removeItem("lastTrimmedFileId");
// } else {
//     localStorage.setItem("lastTrimmedFileId", selected);
// }
setSel(selected);
// localStorage.setItem("lastTrimmedFileId", selected); 
    } catch (err) {
        console.error("Files dropdown failed:", err);
        filesDropdown.value = previous;
    } finally {
        filesDropdown.disabled = false;
    }
});

document.getElementById("saveFileBtn")?.addEventListener("click", async () => {
    if (!saveFileHandler) return;

    if (!hasAnyTrim()) {
        await showModal({ message: "Nothing to save. Please do trim first.",
                          yesText: "OK", noText: null });
        return;
    }
    const name = await showModal({ message: "Enter a file name to save:",
                                   input: true, yesText: "Save", noText: "Cancel" });
    if (!name) return;
    if (/[.#$/\[\]\x00-\x1F\x7F]/.test(name)) {
    // alert
    await showModal({ message: "Invalid file name!\n\nThese characters are not allowed: . $ # / [ ]", yesText: "OK", noText: null });
    return;
}

    try {
        const newId = await runWithLoader("Saving…", () => saveFileHandler(name));
        setDirty(false);
await refreshFilesDropdown(newId);
        // localStorage.setItem("lastTrimmedFileId", newId);
        setSel(newId);  
        
    } catch (err) {
        console.error("SAVE FAILED:", err);
        await showModal({
            message: err.message === "REPORT_PENDING"
            ? "The report is still being generated. Please try again in a moment."
            : err.message === "NAME_EXISTS"
            ? "A file with this name already exists for this study. Please use a different name."
            : "Could not save the file. Please try again.",
            yesText: "OK", noText: null
        });
    }
});

//to show the logout button when click on the doctorname icon in dashboard
// const nextButtonhr = document.getElementById("nextBtnhr");
// const prevButtonhr = document.getElementById("backBtnhr");

// const nextButtonspo2 = document.getElementById("nextBtnspo2");
// const prevButtonspo2 = document.getElementById("backBtnspo2");

// const nextButtonci = document.getElementById("nextBtnci");
// const prevButtonci = document.getElementById("backBtnci");

// const nextButtonrr = document.getElementById("nextBtnrr");
// const prevButtonrr = document.getElementById("backBtnrr");

// nextButtonhr.addEventListener("click", () => {
//     moveZoomWindow("next");
// });

// prevButtonhr.addEventListener("click", () => {
//     moveZoomWindow("prev");
// });



// nextButtonspo2.addEventListener("click", () => {
//     moveZoomWindow("next");
// });


// prevButtonspo2.addEventListener("click", () => {
//     moveZoomWindow("prev");
// });

// nextButtonci.addEventListener("click", () => {
//     moveZoomWindow("next");
// });

// prevButtonci.addEventListener("click", () => {
//     moveZoomWindow("prev");
// });

// nextButtonrr.addEventListener("click", () => {
//     moveZoomWindow("next");
// });

// prevButtonrr.addEventListener("click", () => {
//     moveZoomWindow("prev");
// });
function navigateChunkOrZoom(dir) {
    if (intervalActive && intervalSec && !isManualZoom) {
        showIntervalChunk(intervalIdx + (dir === "next" ? 1 : -1));
    } else {
        moveZoomWindow(dir);
    }
}

[
  ["nextBtnhr", "next"], ["backBtnhr", "prev"],
  ["nextBtnspo2", "next"], ["backBtnspo2", "prev"],
  ["nextBtnci", "next"], ["backBtnci", "prev"],
  ["nextBtnrr", "next"], ["backBtnrr", "prev"]
].forEach(([id, dir]) => {
//   document.getElementById(id)?.addEventListener("click", () => moveZoomWindow(dir));
document.getElementById(id)?.addEventListener("click", () => navigateChunkOrZoom(dir));
});
/* ---------------------------------------
   SHOW / HIDE RESET BUTTON
---------------------------------------- */
function showResetButton(show) {
    // if (resetButtonVisible === show) return; // no operation if unchanged
    // resetButtonVisible = show;

    getCharts().forEach(chart => {

        chart.setOption({
            toolbox: {
                show: true,
                feature: {
                    myTool1: { show: show && chart === window.hrChart }
                }
            }
        });

    });
}


function updateNavigationButtons() {

    const prevButtonhr = document.getElementById("backBtnhr");
    const nextButtonhr = document.getElementById("nextBtnhr");

    const prevButtonspo2 = document.getElementById("backBtnspo2");
    const nextButtonspo2 = document.getElementById("nextBtnspo2");

    const prevButtonci = document.getElementById("backBtnci");
    const nextButtonci = document.getElementById("nextBtnci");

    const prevButtonrr = document.getElementById("backBtnrr");
    const nextButtonrr = document.getElementById("nextBtnrr");

    // interval mode (not zoomed): buttons step through chunks
    if (intervalActive && intervalSec && !isManualZoom) {
        const atStart = intervalIdx <= 0;
        const atEnd = intervalIdx >= intervalCount() - 1;
        [prevButtonhr, prevButtonspo2, prevButtonci, prevButtonrr].forEach(b => b.disabled = atStart);
        [nextButtonhr, nextButtonspo2, nextButtonci, nextButtonrr].forEach(b => b.disabled = atEnd);
        return;
    }

    if (!isManualZoom) {

        prevButtonhr.disabled = true;
        nextButtonhr.disabled = true;

        prevButtonspo2.disabled = true;
        nextButtonspo2.disabled = true;

        prevButtonci.disabled = true;
        nextButtonci.disabled = true;

        prevButtonrr.disabled = true;
        nextButtonrr.disabled = true;

        return;
    }


    const chart = getCharts().find(
        c => c.__rawData && c.__rawData.length
    );

    if (!chart) {
        return;
    }
    //const chart = window.hrChart;
    // if (!chart) return;
    // console.log(window.hrChart);
    // console.log(window.hrChart?.isDisposed?.());
    // console.log(window.hrChart?.getOption?.());
    const dz = chart.getOption().dataZoom?.[0];

    if (!dz || dz.startValue == null || dz.endValue == null) return;

    const rawData = chart.__rawData;

    if (!rawData || !rawData.length) return;

    const minTime = rawData[0][0];
    const maxTime = rawData[rawData.length - 1][0];

    // Disable previous at start
    prevButtonhr.disabled = dz.startValue <= minTime;


    // Disable next at end
    nextButtonhr.disabled = dz.endValue >= maxTime;


    // Disable previous at start
    prevButtonspo2.disabled = dz.startValue <= minTime;


    // Disable next at end
    nextButtonspo2.disabled = dz.endValue >= maxTime;

    // Disable previous at start
    prevButtonci.disabled = dz.startValue <= minTime;


    // Disable next at end
    nextButtonci.disabled = dz.endValue >= maxTime;

    // Disable previous at start
    prevButtonrr.disabled = dz.startValue <= minTime;


    // Disable next at end
    nextButtonrr.disabled = dz.endValue >= maxTime;
}
/* ---------------------------------------
   RESET ALL CHARTS
---------------------------------------- */
function resetAllCharts() {
    const charts = getCharts();
    if (!charts.length) return;

    ignoreZoomEvent = true;
    isManualZoom = false;
    isZoomed = false;
    currentWindow = MAX_WINDOW;

    // Dispatch once — echarts.connect("vitalsGroup") propagates this
    // to the other connected charts, so looping caused redundant,
    // self-conflicting dispatches that needed a 2nd click to settle.
    const primary = charts[0];
    if (primary.__rawData && primary.__rawData.length) {
        primary.dispatchAction({
            type: "dataZoom",
            start: 0,
            end: 100,
            animation: false
        });
    }

    charts.forEach(chart => {
        chart.setOption({
            toolbox: {
                feature: {
                    myTool1: { show: false }
                }
            }
        }, { lazyUpdate: true });
    });

    requestAnimationFrame(() => {
        updateNavigationButtons();
        showResetButton(false);
        charts.forEach(chart => updateYAxis(chart));

        setTimeout(() => {
            ignoreZoomEvent = false;
        }, 60);
    });
}

function showNoData(domId) {
    const el = document.getElementById(domId);

    if (!el) {
        console.error("Element not found:", domId);
        return;
    }

    const chart = echarts.getInstanceByDom(el);

    if (!chart) {
        chart = echarts.init(el);
    }

    chart.clear();


    el.innerHTML = `
        <div style="
            height:100%;
            display:flex;
            align-items:center;
            justify-content:center;
            color:#999;
            font-size:16px;">
            No Data Available
        </div>
    `;

    chart.__rawData = [];
}
export { createVitalChart, showNoData, createTimeWindows, createWindowTabs,
         setManualTrimSaveHandler, setAutoTrimSaveHandler, setTrimRestoreHandler,
         setTrimChangeHandler, setFileHandlers };
