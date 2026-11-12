
function isContinuousTimestamps(rawData, toleranceMultiplier) {
  try {
    if (!Array.isArray(rawData) || rawData.length < 2) {
      return true;
    }

    var timestamps = [];
    for (var i = 0; i < rawData.length; i++) {
      var point = rawData[i];
      if (Array.isArray(point) && typeof point[0] === "number") {
        timestamps.push(point[0]);
      }
    }

    if (timestamps.length < 2) {
      return true;
    }

    timestamps.sort(function (a, b) {
      return a - b;
    });

    var intervals = [];
    for (var j = 1; j < timestamps.length; j++) {
      var delta = timestamps[j] - timestamps[j - 1];
      if (delta > 0) {
        intervals.push(delta);
      }
    }

    if (intervals.length === 0) {
      return true;
    }

    intervals.sort(function (a, b) {
      return a - b;
    });

    var minInterval = intervals[0];
    var maxInterval = intervals[intervals.length - 1];

    var tolerance = typeof toleranceMultiplier === "number" && toleranceMultiplier > 1 ? toleranceMultiplier : 1.5;

    return maxInterval <= minInterval * tolerance;
  } catch (error) {
    console.error(" [history_UI_module.js] Error in isContinuousTimestamps:", error);
    return true;
  }
}

function addTimeGapsForMissingData(rawData, gapMultiplier) {
  try {
    if (!Array.isArray(rawData) || rawData.length === 0) {
      return [];
    }

    // Sort by timestamp (assumed to be in milliseconds)
    var sorted = rawData.slice().sort(function (a, b) {
      return a[0] - b[0];
    });

    if (sorted.length < 2) {
      return sorted;
    }

    // Data is expected every minute. If any minute is missing
    // between two points, insert a null point to break the line
    // so that isolated data stays as a point and continuous
    // minute-wise data renders as a line.
    var ONE_MINUTE_MS = 60 * 1000;
    var result = [sorted[0]];

    for (var j = 1; j < sorted.length; j++) {
      var previous = sorted[j - 1];
      var current = sorted[j];

      var previousTime = previous && typeof previous[0] === "number" ? previous[0] : null;
      var currentTime = current && typeof current[0] === "number" ? current[0] : null;

      if (previousTime !== null && currentTime !== null) {
        var delta = currentTime - previousTime;

        // If there's at least one missing minute between points,
        // insert a null point at the first missing minute to
        // break the line.
        if (delta > ONE_MINUTE_MS) {
          var gapTime = previousTime + ONE_MINUTE_MS;
          var gapPoint = [gapTime];

          for (var k = 1; k < current.length; k++) {
            gapPoint.push(null);
          }

          result.push(gapPoint);
        }
      }

      result.push(current);
    }

    return result;
  } catch (error) {
    console.error(" [history_UI_module.js] Error in addTimeGapsForMissingData:", error);
    return Array.isArray(rawData) ? rawData : [];
  }
}

function formatTooltipWithValues(params) {
  try {
    if (!params) {
      return "";
    }

    if (!Array.isArray(params)) {
      params = [params];
    }

    if (!params.length) {
      return "";
    }

    var first = params[0];
    var firstVal = Array.isArray(first.value) ? first.value : first.data;
    var timestamp = Array.isArray(firstVal) ? firstVal[0] : firstVal;

    if (typeof timestamp !== "number") {
      return "";
    }

    var date = new Date(timestamp);
    var dd = ("0" + date.getDate()).slice(-2);
    var MM = ("0" + (date.getMonth() + 1)).slice(-2);
    var yy = ("" + date.getFullYear()).slice(-2);
    var HH = ("0" + date.getHours()).slice(-2);
    var mm = ("0" + date.getMinutes()).slice(-2);

    // First line: full time (date and time on same line)
    var text = "Time : " + dd + "/" + MM + "/" + yy + " " + HH + ":" + mm;

    for (var i = 0; i < params.length; i++) {
      var item = params[i];
      var v = item && Array.isArray(item.value) ? item.value : item.data;

      if (Array.isArray(v) && v.length > 1) {
        var seriesLabel = item.seriesName || "Value";
        var valuePart;

        if (v.length === 2) {
          valuePart = v[1];
        } else {
          valuePart = v.slice(1).join(", ");
        }

        if (valuePart === null || typeof valuePart === "undefined") {
          valuePart = "-";
        }

        // Each series/value on its own new line in the tooltip
        text += "<br/>" + seriesLabel + " : " + valuePart;
      }
    }

    return text;
  } catch (error) {
    console.error(" [history_UI_module.js] Error in formatTooltipWithValues:", error);
    return "";
  }
}







export { history_ews, history_context_assessment, history_ECG, history_Heart_Rate, history_Blood_Oxygen, history_temperature, history_Blood_presure, history_Respiration_Rate };
