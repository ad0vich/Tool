// host.jsx - Tool

// -- JSON polyfill for ExtendScript (ES3 has no native JSON) --
if (typeof JSON === 'undefined') {
    JSON = {};
}
if (typeof JSON.stringify !== 'function') {
    JSON.stringify = function(val) {
        if (val === null) return 'null';
        if (val === undefined) return undefined;
        var t = typeof val;
        if (t === 'number' || t === 'boolean') return String(val);
        if (t === 'string') {
            return '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                            .replace(/\n/g, '\\n').replace(/\r/g, '\\r')
                            .replace(/\t/g, '\\t') + '"';
        }
        if (val instanceof Array) {
            var a = [];
            for (var i = 0; i < val.length; i++) {
                var v = JSON.stringify(val[i]);
                a.push(v === undefined ? 'null' : v);
            }
            return '[' + a.join(',') + ']';
        }
        if (t === 'object') {
            var parts = [];
            for (var k in val) {
                if (val.hasOwnProperty(k)) {
                    var v2 = JSON.stringify(val[k]);
                    if (v2 !== undefined) {
                        parts.push(JSON.stringify(k) + ':' + v2);
                    }
                }
            }
            return '{' + parts.join(',') + '}';
        }
        return undefined;
    };
}
if (typeof JSON.parse !== 'function') {
    // Safe recursive-descent JSON parser (NO eval)
    JSON.parse = function(text) {
        var at = 0, ch = ' ', escapee = { '"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t' };
        function error(m) { throw new SyntaxError('JSON: ' + m + ' at ' + at); }
        function next(c) {
            if (c && c !== ch) error('Expected "' + c + '" got "' + ch + '"');
            ch = text.charAt(at); at += 1; return ch;
        }
        function white() { while (ch && ch <= ' ') next(); }
        function num() {
            var s = '';
            if (ch === '-') { s = '-'; next(); }
            while (ch >= '0' && ch <= '9') { s += ch; next(); }
            if (ch === '.') { s += '.'; next(); while (ch >= '0' && ch <= '9') { s += ch; next(); } }
            if (ch === 'e' || ch === 'E') {
                s += ch; next();
                if (ch === '-' || ch === '+') { s += ch; next(); }
                while (ch >= '0' && ch <= '9') { s += ch; next(); }
            }
            var n = +s;
            if (!isFinite(n)) error('Bad number');
            return n;
        }
        function str() {
            var s = '';
            if (ch !== '"') error('Bad string');
            while (next()) {
                if (ch === '"') { next(); return s; }
                if (ch === '\\') {
                    next();
                    if (ch === 'u') {
                        var hex = '';
                        for (var i = 0; i < 4; i++) {
                            next();
                            if (!/[0-9a-fA-F]/.test(ch)) error('Bad unicode');
                            hex += ch;
                        }
                        s += String.fromCharCode(parseInt(hex, 16));
                    } else if (typeof escapee[ch] === 'string') {
                        s += escapee[ch];
                    } else error('Bad escape');
                } else s += ch;
            }
            error('Unterminated string');
        }
        function word() {
            if (ch === 't' && text.substr(at - 1, 4) === 'true')   { at += 3; next(); return true; }
            if (ch === 'f' && text.substr(at - 1, 5) === 'false')  { at += 4; next(); return false; }
            if (ch === 'n' && text.substr(at - 1, 4) === 'null')   { at += 3; next(); return null; }
            error('Bad value');
        }
        function arr() {
            var a = [];
            if (ch !== '[') error('Bad array');
            next(); white();
            if (ch === ']') { next(); return a; }
            while (ch) {
                a.push(val()); white();
                if (ch === ']') { next(); return a; }
                if (ch !== ',') error('Bad array');
                next(); white();
            }
            error('Bad array');
        }
        function obj() {
            var o = {}, k;
            if (ch !== '{') error('Bad object');
            next(); white();
            if (ch === '}') { next(); return o; }
            while (ch) {
                k = str(); white();
                if (ch !== ':') error('Bad object');
                next(); o[k] = val(); white();
                if (ch === '}') { next(); return o; }
                if (ch !== ',') error('Bad object');
                next(); white();
            }
            error('Bad object');
        }
        function val() {
            white();
            if (ch === '{') return obj();
            if (ch === '[') return arr();
            if (ch === '"') return str();
            if (ch === '-' || (ch >= '0' && ch <= '9')) return num();
            return word();
        }
        var result = val();
        white();
        if (ch) error('Unexpected trailing');
        return result;
    };
}

function testHost() { return '{"success":true,"data":"XYZTool_OK"}'; }

// -- Auto-update installer -----------------------------------
function installExtensionUpdate(url) {
    try {
        var tmpZip, extDir, cmd;
        if ($.os.indexOf('Mac') >= 0) {
            tmpZip = '/tmp/XYZtool_update.zip';
            extDir = Folder('~/Library/Application Support/Adobe/CEP/extensions/XYZTool').fsName;
            // Download
            system.callSystem('curl -sL --max-time 60 -o "' + tmpZip + '" "' + url + '"');
            // Verify download
            var f = new File(tmpZip);
            if (!f.exists) return JSON.stringify({ ok: false, error: 'Download failed' });
            // Extract (overwrite)
            system.callSystem('unzip -o "' + tmpZip + '" -d "' + extDir + '"');
            // Cleanup
            system.callSystem('rm -f "' + tmpZip + '"');
        } else {
            tmpZip = $.getenv('TEMP') + '\\\\XYZtool_update.zip';
            extDir = $.getenv('APPDATA') + '\\\\Adobe\\\\CEP\\\\extensions\\\\XYZTool';
            cmd = 'powershell -Command "';
            cmd += "Invoke-WebRequest -Uri '" + url + "' -OutFile '" + tmpZip + "' -TimeoutSec 60; ";
            cmd += "Expand-Archive -Force -Path '" + tmpZip + "' -DestinationPath '" + extDir + "'; ";
            cmd += "Remove-Item '" + tmpZip + "'";
            cmd += '"';
            system.callSystem('cmd /c ' + cmd);
        }
        return JSON.stringify({ ok: true });
    } catch(e) {
        return JSON.stringify({ ok: false, error: e.toString() });
    }
}

function getComp() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return null;
    return comp;
}
function ok(d)  { return JSON.stringify({ success: true,  data: d || null }); }
function err(m) { return JSON.stringify({ success: false, error: m }); }

// -- TAB 1: LAYER ALIGN + TIME REMAP -------------------------
function runLayerAlign(optJSON) {
    var o = JSON.parse(optJSON);
    var comp = getComp();
    if (!comp) return err("No active composition");

    var fd  = 1 / comp.frameRate;
    var gap = (parseInt(o.gapFrames) || 0) * fd;
    var layers = [];

    for (var i = 1; i <= comp.numLayers; i++) {
        if (!o.selectedOnly || comp.layer(i).selected)
            layers.push(comp.layer(i));
    }
    if (!layers.length) return err("No layers found");
    if (o.respectOrder) layers.sort(function(a, b) { return a.index - b.index; });

    var savedTime = comp.time;
    app.beginUndoGroup("LTP: Align + Remap");
    try {
        var cursor = o.startAtZero
            ? 0
            : Math.min(layers[0].inPoint, layers[0].outPoint);

        for (var i = 0; i < layers.length; i++) {
            var lyr   = layers[i];
            var isFoot = lyr.source && (lyr.source instanceof FootageItem);
            var inPt  = Math.min(lyr.inPoint, lyr.outPoint);

            if (o.doAlign) {
                lyr.startTime += cursor - inPt;
                cursor = Math.max(lyr.inPoint, lyr.outPoint) + gap;
            }
            if (o.doRemap && isFoot) {
                try {
                    var inT  = Math.min(lyr.inPoint, lyr.outPoint);
                    var outT = Math.max(lyr.inPoint, lyr.outPoint);
                    comp.time = Math.max(0, Math.min(comp.duration - fd, inT + fd));
                    lyr.timeRemapEnabled = true;
                    var tr = lyr.property("ADBE Time Remapping");
                    var valIn  = tr.valueAtTime(inT,  false);
                    var valOut = tr.valueAtTime(outT, false);
                    var k1 = tr.addKey(inT);
                    tr.setValueAtKey(k1, valIn);
                    tr.setInterpolationTypeAtKey(k1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                    var k2 = tr.addKey(outT);
                    tr.setValueAtKey(k2, valOut);
                    tr.setInterpolationTypeAtKey(k2, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                    var toDelete = [];
                    for (var k = 1; k <= tr.numKeys; k++) {
                        var kt = tr.keyTime(k);
                        if (Math.abs(kt - inT) > fd * 0.5 && Math.abs(kt - outT) > fd * 0.5)
                            toDelete.push(k);
                    }
                    for (var d = toDelete.length - 1; d >= 0; d--)
                        tr.removeKey(toDelete[d]);
                } catch(re) {}
            }
        }
        comp.time = Math.max(0, Math.min(comp.duration - fd, savedTime));
    } catch(e) {
        app.endUndoGroup();
        return err(e.toString());
    }
    app.endUndoGroup();
    return ok("Done");
}

// -- TAB 2: SPEED RAMP PRESETS --------------------------------
// Returns selected layer indices so main.js can embed them into the native JSX
// before dispatching via osascript (which is async -- selection may change by then).
function getSelectedLayerIndices() {
    var comp = getComp();
    if (!comp) return err("No active composition");
    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");
    var indices = [];
    for (var i = 0; i < layers.length; i++) indices.push(layers[i].index);
    return ok(indices);
}

// Full speed preset application via evalScript -- walks ALL properties on selected layers.
// Replaces the old osascript/DoScript path that was timing out in AE 2025.
function applySpeedGlobal(presetJSON) {
    try {
        var preset = JSON.parse(presetJSON);
        var comp   = getComp();
        if (!comp) return err("No active composition");

        var layers = comp.selectedLayers;
        if (!layers.length) return err("No layers selected");

        var interp  = preset.interpolation || "BEZIER";
        var outInf  = preset.outInfluence !== undefined ? preset.outInfluence : 33;
        var inInf   = preset.inInfluence  !== undefined ? preset.inInfluence  : 33;
        // Value graph bezier coordinates (if present)
        var hasXY   = preset.x1 !== undefined && preset.y1 !== undefined;
        var bx1 = hasXY ? preset.x1 : 0;
        var by1 = hasXY ? preset.y1 : 0;
        var bx2 = hasXY ? preset.x2 : 1;
        var by2 = hasXY ? preset.y2 : 1;
        // Explicit AE ease overrides (speed as ratio of avgSpd + influence %)
        var aeEase  = preset.aeEase || null;
        var count   = 0;
        var lastErr = "";

        function easeArr(spd, inf, dim) {
            var a = [];
            for (var d = 0; d < dim; d++) a.push(new KeyframeEase(spd, inf));
            return a;
        }

        // Compute signed average speed between two keyframe values
        // For 1D: signed difference. For multi-dim: magnitude (always positive).
        function valDiff(v1, v2) {
            if (typeof v1 === 'number') return v2 - v1; // signed!
            // Array value (Position, Scale, etc.) -- use magnitude
            var sum = 0;
            for (var i = 0; i < v1.length; i++) sum += (v2[i] - v1[i]) * (v2[i] - v1[i]);
            return Math.sqrt(sum);
        }

        function applyProp(prop) {
            if (!prop.numKeys) return;

            var sel = [];
            for (var k = 1; k <= prop.numKeys; k++) {
                try { if (prop.keySelected(k)) sel.push(k); } catch(e_) {}
            }
            if (!sel.length) return; // Only apply to properties with selected keys
            var tot = sel.length;

            // Spatial properties (Position) use 1-element ease arrays regardless of dimensions
            // Non-spatial multi-dim properties (Scale) use N-element arrays
            var dim = 1;
            try {
                var pvt = prop.propertyValueType;
                if (pvt === PropertyValueType.TwoD || pvt === PropertyValueType.ThreeD) {
                    var v0 = prop.keyValue(sel[0]);
                    if (typeof v0 === 'object' && v0.length) dim = v0.length;
                }
                // TwoD_SPATIAL, ThreeD_SPATIAL, OneD -> dim stays 1
            } catch(e_) {}

            if (interp === "LINEAR") {
                for (var k = 0; k < tot; k++) {
                    try { prop.setInterpolationTypeAtKey(sel[k],
                        KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
                        count++;
                    } catch(e_) {}
                }
                return;
            }
            if (interp === "HOLD") {
                for (var k = 0; k < tot; k++) {
                    try { prop.setInterpolationTypeAtKey(sel[k],
                        KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
                        count++;
                    } catch(e_) {}
                }
                return;
            }

            for (var k = 0; k < tot; k++) {
                try {
                    prop.setInterpolationTypeAtKey(sel[k],
                        KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
                } catch(e_) { lastErr = "interp:" + e_.toString(); continue; }

                // Read existing ease so we can preserve the "outer" handle
                var existIn  = null, existOut = null;
                try { existIn  = prop.keyInTemporalEase(sel[k]);  } catch(e_) {}
                try { existOut = prop.keyOutTemporalEase(sel[k]); } catch(e_) {}

                var aOutInf = (k === tot - 1) ? 0.1 : outInf;
                var aInInf  = (k === 0)       ? 0.1 : inInf;
                var aOutSpd = 0;
                var aInSpd  = 0;

                // For value graph presets, calculate speed from bezier or explicit overrides
                if (aeEase) {
                    // Explicit AE ease overrides -- speed as ratio of avgSpd
                    if (k < tot - 1) {
                        try {
                            var t1 = prop.keyTime(sel[k]);
                            var t2 = prop.keyTime(sel[k + 1]);
                            var v1 = prop.keyValue(sel[k]);
                            var v2 = prop.keyValue(sel[k + 1]);
                            var dT = Math.abs(t2 - t1);
                            var dV = valDiff(v1, v2);
                            if (dT > 0.0001 && Math.abs(dV) > 0.0001) {
                                var avgSpd = dV / dT;
                                aOutSpd = aeEase.outSpdR * avgSpd;
                                aOutInf = aeEase.outInf;
                            }
                        } catch(e_) {}
                    }
                    if (k > 0) {
                        try {
                            var t1 = prop.keyTime(sel[k - 1]);
                            var t2 = prop.keyTime(sel[k]);
                            var v1 = prop.keyValue(sel[k - 1]);
                            var v2 = prop.keyValue(sel[k]);
                            var dT = Math.abs(t2 - t1);
                            var dV = valDiff(v1, v2);
                            if (dT > 0.0001 && Math.abs(dV) > 0.0001) {
                                var avgSpd = dV / dT;
                                aInSpd = aeEase.inSpdR * avgSpd;
                                aInInf = aeEase.inInf;
                            }
                        } catch(e_) {}
                    }
                } else if (hasXY) {
                    // Bezier heuristic for custom presets
                    // OUT handle -- departure speed for segment k -> k+1
                    if (k < tot - 1) {
                        try {
                            var t1 = prop.keyTime(sel[k]);
                            var t2 = prop.keyTime(sel[k + 1]);
                            var v1 = prop.keyValue(sel[k]);
                            var v2 = prop.keyValue(sel[k + 1]);
                            var dT = Math.abs(t2 - t1);
                            var dV = valDiff(v1, v2);

                            if (dT > 0.0001 && Math.abs(dV) > 0.0001) {
                                var avgSpd = dV / dT;
                                if (bx1 > 0.01) {
                                    aOutSpd = (by1 / bx1) * avgSpd;
                                    aOutInf = Math.max(0.1, Math.min(100, bx1 * 100));
                                } else if (bx2 > 0.01) {
                                    var slope2 = by2 / bx2;
                                    if (slope2 < 0.3) {
                                        aOutSpd = 0;
                                        aOutInf = Math.max(5, bx2 * 100);
                                    } else {
                                        aOutSpd = avgSpd * Math.max(2, slope2 * 3);
                                        aOutInf = Math.max(3, Math.min(10, bx2 * 10));
                                    }
                                } else {
                                    aOutSpd = avgSpd * 3;
                                    aOutInf = 5;
                                }
                            }
                        } catch(e_) {}
                    }
                    // IN handle -- arrival speed for segment k-1 -> k
                    if (k > 0) {
                        try {
                            var t1 = prop.keyTime(sel[k - 1]);
                            var t2 = prop.keyTime(sel[k]);
                            var v1 = prop.keyValue(sel[k - 1]);
                            var v2 = prop.keyValue(sel[k]);
                            var dT = Math.abs(t2 - t1);
                            var dV = valDiff(v1, v2);

                            if (dT > 0.0001 && Math.abs(dV) > 0.0001) {
                                var avgSpd = dV / dT;
                                var rx2 = 1 - bx2;
                                if (rx2 > 0.01) {
                                    aInSpd = ((1 - by2) / rx2) * avgSpd;
                                    aInInf = Math.max(0.1, Math.min(100, rx2 * 100));
                                } else {
                                    var rx1 = 1 - bx1;
                                    if (rx1 > 0.01) {
                                        var ry1 = 1 - by1;
                                        var slope2 = ry1 / rx1;
                                        if (slope2 < 0.3) {
                                            aInSpd = 0;
                                            aInInf = Math.max(5, rx1 * 100);
                                        } else {
                                            aInSpd = avgSpd * Math.max(2, slope2 * 3);
                                            aInInf = Math.max(3, Math.min(10, rx1 * 10));
                                        }
                                    } else {
                                        aInSpd = avgSpd * 3;
                                        aInInf = 5;
                                    }
                                }
                            }
                        } catch(e_) {}
                    }
                }

                // Build new ease arrays
                var newIn  = easeArr(aInSpd, aInInf, dim);
                var newOut = easeArr(aOutSpd, aOutInf, dim);

                // Preserve outer handles: first key keeps its existing in-ease,
                // last key keeps its existing out-ease (don't touch adjacent segments)
                if (k === 0 && existIn) newIn = existIn;
                if (k === tot - 1 && existOut) newOut = existOut;

                try {
                    prop.setTemporalEaseAtKey(sel[k], newIn, newOut);
                    count++;
                } catch(e_) {
                    lastErr = prop.name + " k" + sel[k] + " dim" + dim + ": " + e_.toString();
                }
            }
        }

        function walkPG(pg) {
            for (var i = 1; i <= pg.numProperties; i++) {
                var p = pg.property(i);
                try { if (p.numProperties > 0) walkPG(p); } catch(e_) {}
                try { applyProp(p); } catch(e_) {}
            }
        }

        app.beginUndoGroup("LTP: Speed Preset");
        for (var i = 0; i < layers.length; i++) walkPG(layers[i]);
        app.endUndoGroup();

        return ok("Applied: " + (preset.name || "Preset"));
    } catch(e) {
        try { app.endUndoGroup(); } catch(e2) {}
        return err(e.toString());
    }
}

// BEZIER presets are handled via osascript -> DoScript (native AE context, no restrictions).
// Only LINEAR / HOLD go through evalScript (setInterpolationType is not blocked).
function applySpeedPreset(presetJSON) {
    var preset = JSON.parse(presetJSON);
    var comp   = getComp();
    if (!comp) return err("No active composition");

    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");

    app.beginUndoGroup("LTP: Speed Preset");
    try {
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            var tr    = layer.property("ADBE Time Remapping");

            if (!tr || !tr.numKeys) {
                if (layer.source && (layer.source instanceof FootageItem)) {
                    layer.timeRemapEnabled = true;
                    tr = layer.property("ADBE Time Remapping");
                }
            }
            if (!tr || !tr.numKeys) continue;

            // Collect selected keyframes only
            var selKeys = [];
            for (var k = 1; k <= tr.numKeys; k++) {
                try { if (tr.keySelected(k)) selKeys.push(k); } catch(e) {}
            }
            // Fall back to all keyframes if none selected
            if (!selKeys.length) {
                for (var k = 1; k <= tr.numKeys; k++) selKeys.push(k);
            }

            // Built-in presets carry x1/y1/x2/y2 -> use exact bezier math.
            // User-saved presets carry inInfluence/outInfluence -> use positional fallback.
            if (preset.x1 !== undefined) {
                _applyBezierEasing(layer, selKeys, preset);
            } else {
                var total = selKeys.length;
                for (var p = 0; p < total; p++) {
                    _applyEasingPositional(layer, selKeys[p], preset, p, total);
                }
            }
        }
    } catch(e) {
        app.endUndoGroup();
        return err(e.toString());
    }
    app.endUndoGroup();
    return ok("Applied");
}

// Bezier easing helper -- called only for BEZIER presets via the evalScript path.
// In AE 2025, setTemporalEaseAtKey is blocked in CEP evalScript; main.js instead
// routes BEZIER presets through osascript -> DoScript (native AE context, no restriction).
// This function still sets the interpolation type (which works) as a best-effort path.
function _applyBezierEasing(layer, keys, preset) {
    var interp = preset.interpolation || "BEZIER";
    var prop;

    if (interp === "LINEAR") {
        prop = layer.property("ADBE Time Remapping");
        for (var i = 0; i < keys.length; i++)
            prop.setInterpolationTypeAtKey(keys[i],
                KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        return;
    }
    if (interp === "HOLD") {
        prop = layer.property("ADBE Time Remapping");
        for (var i = 0; i < keys.length; i++)
            prop.setInterpolationTypeAtKey(keys[i],
                KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        return;
    }

    var x1 = preset.x1, y1 = preset.y1;
    var x2 = preset.x2, y2 = preset.y2;
    var outInf = Math.max(1, Math.min(99, x1 * 100));
    var inInf  = Math.max(1, Math.min(99, (1 - x2) * 100));
    var x1s = (x1 < 0.01) ? 0.01 : x1;
    var x2s = (x2 > 0.99) ? 0.99 : x2;

    // Snapshot keyframe times, values and compute easing params
    prop = layer.property("ADBE Time Remapping");
    var keyData = [];
    for (var i = 0; i < keys.length; i++)
        keyData.push({ t: prop.keyTime(keys[i]), v: prop.keyValue(keys[i]) });

    var easings = [];
    for (var i = 0; i < keyData.length; i++) {
        var outSpd = 0, outInfI = 33;
        if (i < keyData.length - 1) {
            var dT = keyData[i+1].t - keyData[i].t;
            var dV = keyData[i+1].v - keyData[i].v;
            var sc = (Math.abs(dT) > 0.0001) ? Math.abs(dV / dT) : 0;
            outSpd = (y1 / x1s) * sc;
            if (x1s * outSpd > sc) outSpd = sc / x1s;
            outInfI = outInf;
        }
        var inSpd = 0, inInfI = 33;
        if (i > 0) {
            var dT = keyData[i].t - keyData[i-1].t;
            var dV = keyData[i].v - keyData[i-1].v;
            var sc = (Math.abs(dT) > 0.0001) ? Math.abs(dV / dT) : 0;
            inSpd = ((1 - y2) / (1 - x2s)) * sc;
            if ((1 - x2s) * inSpd > sc) inSpd = sc / (1 - x2s);
            inInfI = inInf;
        }
        easings.push({ inSpd: inSpd, inInfI: inInfI, outSpd: outSpd, outInfI: outInfI });
    }

    // Set BEZIER interpolation type (works in AE 2025 CEP)
    prop = layer.property("ADBE Time Remapping");
    for (var i = 0; i < keys.length; i++) {
        prop.setInterpolationTypeAtKey(keys[i],
            KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
    }
    // setTemporalEaseAtKey is blocked in AE 2025 CEP evalScript -- main.js routes
    // BEZIER presets through osascript/DoScript where it works natively.
    prop = layer.property("ADBE Time Remapping");
    for (var i = 0; i < keys.length; i++) {
        try {
            prop.setTemporalEaseAtKey(keys[i],
                [new KeyframeEase(easings[i].inSpd,  easings[i].inInfI)],
                [new KeyframeEase(easings[i].outSpd, easings[i].outInfI)]);
        } catch(e) { /* blocked in AE 2025 CEP -- handled via osascript in main.js */ }
    }
}

// Fallback for user-saved presets (no x1/y1/x2/y2 -- only inInfluence/outInfluence).
function _applyEasingPositional(layer, ki, preset, pos, total) {
    var prop = layer.property("ADBE Time Remapping");
    if (preset.interpolation === "LINEAR") {
        prop.setInterpolationTypeAtKey(ki,
            KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
        return;
    }
    if (preset.interpolation === "HOLD") {
        prop.setInterpolationTypeAtKey(ki,
            KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        return;
    }
    prop.setInterpolationTypeAtKey(ki,
        KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);

    prop = layer.property("ADBE Time Remapping");
    var inInf  = (preset.inInfluence  !== undefined) ? preset.inInfluence  : 33;
    var outInf = (preset.outInfluence !== undefined) ? preset.outInfluence : 33;
    var applyIn  = (pos === 0)         ? 33 : inInf;
    var applyOut = (pos === total - 1) ? 33 : outInf;

    try {
        prop.setTemporalEaseAtKey(ki,
            [new KeyframeEase(0, applyIn)],
            [new KeyframeEase(0, applyOut)]);
    } catch(e) {}
}

// -- FRAME EXPORT ---------------------------------------------

// Export current frame to Assets/Screenshots/ next to the project file.
// File is named after the comp: CompName_001.png, CompName_002.png, etc.
// Falls back to Desktop/Assets/Screenshots if the project is not saved yet.
function exportFrameToScreenshots() {
    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return err("No active composition");

    // Require saved project
    if (!app.project.file) return err("PROJECT_NOT_SAVED");

    var baseDir = app.project.file.parent.fsName + "/Assets/Screenshots";

    var outFolder = new Folder(baseDir);
    if (!outFolder.exists && !outFolder.create()) return err("Cannot create folder: " + baseDir);

    // Sanitize comp name for use in a filename
    var compName = comp.name.replace(/[^a-zA-Z0-9_\-]/g, "_");

    // Find next available sequential number
    var nextNum = 1;
    for (var n = 1; n <= 999; n++) {
        var numStr = (n < 10 ? "00" : (n < 100 ? "0" : "")) + n;
        var probe  = new File(baseDir + "/" + compName + "_" + numStr + ".png");
        if (!probe.exists) { nextNum = n; break; }
    }
    var seq      = (nextNum < 10 ? "00" : (nextNum < 100 ? "0" : "")) + nextNum;
    var baseName = compName + "_" + seq;
    var baseFile = new File(baseDir + "/" + baseName);

    var rq  = app.project.renderQueue;
    var rqi = rq.items.add(comp);

    try {
        rqi.timeSpanStart    = comp.time;
        rqi.timeSpanDuration = rqi.comp.frameDuration;

        var om = rqi.outputModules[1];
        var tpls = ["PNG sequence", "_PNG", "PNG"];
        for (var t = 0; t < tpls.length; t++) {
            try { om.applyTemplate(tpls[t]); break; } catch(e) {}
        }
        om.file = baseFile;
        app.project.renderQueue.render();

        // AE appends frame number suffix (e.g. .png00023) -- find and rename to clean .png
        var found = outFolder.getFiles(baseName + "*");
        if (found && found.length > 0) {
            var rawFile   = found[0];
            var cleanName = baseName + ".png";
            if (rawFile.name !== cleanName) rawFile.rename(cleanName);
        } else {
            try { rqi.remove(); } catch(e2) {}
            return err("File not found after render");
        }
    } catch(e) {
        try { rqi.remove(); } catch(e2) {}
        return err("Frame export failed: " + e.toString());
    }
    try { rqi.remove(); } catch(e) {}

    return ok(baseName + ".png");
}

// Get or create a nested bin folder in the AE project.
// folderPath is "AI/Images" -> creates "AI" folder then "Images" inside it.
function _getOrCreateFolder(folderPath) {
    var parts = folderPath.split("/");
    var parent = app.project.rootFolder;
    for (var i = 0; i < parts.length; i++) {
        var name   = parts[i];
        var found  = null;
        for (var j = 1; j <= parent.numItems; j++) {
            if (parent.item(j) instanceof FolderItem && parent.item(j).name === name) {
                found = parent.item(j); break;
            }
        }
        if (!found) found = app.project.items.addFolder(name);
        // Move to correct parent if needed
        try { found.parentFolder = parent; } catch(e) {}
        parent = found;
    }
    return parent;
}

// -- SORT PROJECT ---------------------------------------------

function sortProjectItems(optJSON) {
    var opts = JSON.parse(optJSON);

    var fMedia     = opts.folderMedia     || "Media";
    var fImages    = opts.folderImages    || "Images";
    var fSequences = opts.folderSequences || "Images/Sequences";
    var fTracks    = opts.folderTracks    || "Music/Tracks";
    var fSFX       = opts.folderSFX       || "Music/SFX";
    var fAssets    = opts.folderAssets    || "Assets";
    var fComps      = opts.folderComps      || "Comp";
    var fAdditional = opts.folderAdditional || "Additional";

    var videoExts = {mp4:1,mov:1,avi:1,mkv:1,mxf:1,wmv:1,flv:1,webm:1,m4v:1,
                     mpg:1,mpeg:1,r3d:1,braw:1,arri:1,dng:1};
    var imageExts = {png:1,jpg:1,jpeg:1,tiff:1,tif:1,psd:1,psb:1,
                     ai:1,eps:1,bmp:1,gif:1,webp:1,dpx:1,exr:1,hdr:1};
    var audioExts = {mp3:1,wav:1,aac:1,aiff:1,aif:1,ogg:1,m4a:1,flac:1,wma:1};

    // Snapshot all items first to avoid index shifting during moves
    var items = [];
    for (var i = 1; i <= app.project.numItems; i++) {
        items.push(app.project.item(i));
    }

    var moved = 0;
    var mainInfo = "";
    app.beginUndoGroup("LTP: Sort Project");
    try {
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item instanceof FolderItem) continue;
            if (item instanceof CompItem) {
                try { item.parentFolder = _getOrCreateFolder(fComps); moved++; } catch(e) {}
                continue;
            }

            if (item instanceof FootageItem) {

                // Solids + Adjustment Layer sources -> Assets
                if (item.mainSource instanceof SolidSource) {
                    try { item.parentFolder = _getOrCreateFolder(fAssets); moved++; } catch(e) {}
                    continue;
                }

                // File-based footage
                var src = item.mainSource;
                if (!(src instanceof FileSource)) continue;
                var f = src.file;
                if (!f) continue;

                var parts = f.name.toLowerCase().split('.');
                var ext = parts[parts.length - 1];

                if (videoExts[ext]) {
                    try { item.parentFolder = _getOrCreateFolder(fMedia); moved++; } catch(e) {}

                } else if (imageExts[ext]) {
                    var dest = src.isStill ? fImages : fSequences;
                    try { item.parentFolder = _getOrCreateFolder(dest); moved++; } catch(e) {}

                } else if (audioExts[ext]) {
                    var dest = (item.duration > 0 && item.duration < 10) ? fSFX : fTracks;
                    try { item.parentFolder = _getOrCreateFolder(dest); moved++; } catch(e) {}
                }
            }
        }

        // -- Pull out the main composition --
        // "Main" = the comp that nests the most other comps (recursively,
        // deduped) — almost always the deliverable timeline. The main
        // comp sits at the top of fComps; everything else moves into
        // a sub-folder "Additional" so it's clear what's deliverable
        // and what's supporting / pre-comps / orphans.
        try {
            // Recursive walker — keyed by item.id to avoid cycles
            var collectDescendantComps = function(comp, set) {
                if (set[comp.id]) return;
                set[comp.id] = comp;
                for (var li = 1; li <= comp.numLayers; li++) {
                    try {
                        var src = comp.layer(li).source;
                        if (src instanceof CompItem) collectDescendantComps(src, set);
                    } catch(e_) {}
                }
            };

            // Scan every comp; pick the one with the most descendants
            var mainComp = null;
            var mainCount = 0;
            for (var pi = 1; pi <= app.project.numItems; pi++) {
                var it = app.project.item(pi);
                if (!(it instanceof CompItem)) continue;
                var descSet = {};
                collectDescendantComps(it, descSet);
                var descCount = 0;
                for (var k in descSet) if (descSet.hasOwnProperty(k)) descCount++;
                var nested = descCount - 1; // exclude the comp itself
                if (nested > mainCount) {
                    mainCount = nested;
                    mainComp = it;
                }
            }

            if (mainComp) {
                var compsFolder = _getOrCreateFolder(fComps);
                var additionalFolder = _getOrCreateFolder(fComps + "/" + fAdditional);
                // Make sure the main comp sits at fComps root (not in Additional)
                try { mainComp.parentFolder = compsFolder; } catch(e_) {}

                // Move every OTHER comp into Additional
                var movedIn = 0;
                for (var pi2 = 1; pi2 <= app.project.numItems; pi2++) {
                    var it2 = app.project.item(pi2);
                    if (!(it2 instanceof CompItem)) continue;
                    if (it2.id === mainComp.id) continue;
                    try { it2.parentFolder = additionalFolder; movedIn++; } catch(e_) {}
                }
                mainInfo = " · Main: \"" + mainComp.name + "\" (" + movedIn + " in Additional)";
            } else {
                mainInfo = " · no main comp detected";
            }
        } catch(eGroup) { mainInfo = " · group err: " + eGroup.toString().slice(0, 60); }
    } catch(e) {
        app.endUndoGroup();
        return err("Sort failed: " + e.toString());
    }
    app.endUndoGroup();
    return ok("Sorted " + moved + " items" + mainInfo);
}

// Import a file from disk into the AE project under the given bin folder path.
function importToProject(filePath, folderPath) {
    var f = new File(filePath);
    if (!f.exists) return err("File not found: " + filePath);

    app.beginUndoGroup("LTP: Import AI Asset");
    try {
        var io   = new ImportOptions(f);
        io.sequence = false;
        var item = app.project.importFile(io);
        item.parentFolder = _getOrCreateFolder(folderPath || "AI/Images");
    } catch(e) {
        app.endUndoGroup();
        return err("Import failed: " + e.toString());
    }
    app.endUndoGroup();
    return ok("Imported: " + f.name);
}

// Import a video file and add it to the active comp at the current playhead.
function importAndAddToTimeline(filePath, folderPath) {
    var f = new File(filePath);
    if (!f.exists) return err("File not found: " + filePath);

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return err("No active composition");

    app.beginUndoGroup("LTP: Add AI Video");
    try {
        var io   = new ImportOptions(f);
        io.sequence = false;
        var item = app.project.importFile(io);
        item.parentFolder = _getOrCreateFolder(folderPath || "AI/Videos");

        var layer      = comp.layers.add(item);
        layer.startTime = comp.time;
    } catch(e) {
        app.endUndoGroup();
        return err("Failed: " + e.toString());
    }
    app.endUndoGroup();
    return ok("Added to timeline");
}

// -- TAB 3: ANCHOR POINT --------------------------------------
// Get visible rect: intersection of sourceRect and mask bounds (if mask exists)
function getVisibleRect(lyr, t) {
    // Clamp t to layer's active range so mask shape evaluates correctly
    try {
        if (t < lyr.inPoint) t = lyr.inPoint;
        else if (t > lyr.outPoint - 0.001) t = lyr.outPoint - 0.001;
    } catch(eClamp) {}

    // If layer has a closed mask, compute bounds including bezier curves
    try {
        var masks = lyr.property("ADBE Mask Parade");
        if (masks && masks.numProperties > 0) {
            for (var m = 1; m <= masks.numProperties; m++) {
                var mask = masks.property(m);
                var isInverted = false;
                try { isInverted = mask.inverted === true; } catch(eInv) {}
                try {
                    var modeProp = mask.property("ADBE Mask Mode");
                    if (modeProp && modeProp.value === MaskMode.SUBTRACT) isInverted = true;
                } catch(eMode) {}
                if (isInverted) continue;
                var shape = mask.property("ADBE Mask Shape").valueAtTime(t, false);
                if (!shape.closed) continue;

                var verts = shape.vertices;
                var inT   = shape.inTangents  || [];
                var outT  = shape.outTangents || [];
                var minX = Infinity, maxX = -Infinity;
                var minY = Infinity, maxY = -Infinity;
                var n = verts.length;
                for (var v = 0; v < n; v++) {
                    var pv = verts[v];
                    if (pv[0] < minX) minX = pv[0];
                    if (pv[0] > maxX) maxX = pv[0];
                    if (pv[1] < minY) minY = pv[1];
                    if (pv[1] > maxY) maxY = pv[1];
                }
                // Include bezier curve extrema between adjacent vertices
                for (var s = 0; s < n; s++) {
                    var i0 = s, i1 = (s + 1) % n;
                    var p0 = verts[i0], p3 = verts[i1];
                    var ot = outT[i0] || [0, 0];
                    var it = inT[i1]  || [0, 0];
                    var p1 = [p0[0] + ot[0], p0[1] + ot[1]];
                    var p2 = [p3[0] + it[0], p3[1] + it[1]];
                    for (var axis = 0; axis < 2; axis++) {
                        // B(t) extrema on [0,1] for cubic bezier
                        var A = p1[axis] - p0[axis];
                        var B_ = p2[axis] - p1[axis];
                        var C = p3[axis] - p2[axis];
                        var alpha = A - 2*B_ + C;
                        var beta  = -2*A + 2*B_;
                        var gamma = A;
                        var ts = [];
                        if (Math.abs(alpha) < 1e-9) {
                            if (Math.abs(beta) > 1e-9) ts.push(-gamma / beta);
                        } else {
                            var disc = beta*beta - 4*alpha*gamma;
                            if (disc >= 0) {
                                var sq = Math.sqrt(disc);
                                ts.push((-beta + sq) / (2*alpha));
                                ts.push((-beta - sq) / (2*alpha));
                            }
                        }
                        for (var k = 0; k < ts.length; k++) {
                            var u = ts[k];
                            if (u > 0 && u < 1) {
                                var omu = 1 - u;
                                var val = omu*omu*omu*p0[axis]
                                        + 3*omu*omu*u*p1[axis]
                                        + 3*omu*u*u*p2[axis]
                                        + u*u*u*p3[axis];
                                if (axis === 0) {
                                    if (val < minX) minX = val;
                                    if (val > maxX) maxX = val;
                                } else {
                                    if (val < minY) minY = val;
                                    if (val > maxY) maxY = val;
                                }
                            }
                        }
                    }
                }
                return { top: minY, left: minX, width: maxX - minX, height: maxY - minY };
            }
        }
    } catch(e) {}
    return lyr.sourceRectAtTime(t, true);
}

function setAnchorPoint(posIndex) {
    var comp = getComp();
    if (!comp) return err("No active composition");
    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");

    app.beginUndoGroup("LTP: Set Anchor Point");
    try {
        for (var i = 0; i < layers.length; i++) {
            var lyr  = layers[i];
            var rect = getVisibleRect(lyr, comp.time);
            var col  = posIndex % 3;
            var row  = Math.floor(posIndex / 3);
            var ax = rect.left + (col * 0.5) * rect.width;
            var ay = rect.top  + (row * 0.5) * rect.height;

            // Capture old anchor before changing
            var oldA = lyr.anchorPoint.value;

            // Set anchor (respects keyframes)
            if (lyr.anchorPoint.numKeys > 0) {
                lyr.anchorPoint.setValueAtTime(comp.time, [ax, ay]);
            } else {
                lyr.anchorPoint.setValue([ax, ay]);
            }

            // Compensate position so each layer stays visually in place
            // (works for both single and multi-select -- layers do not jump)
            var oldP = lyr.position.value;
            var scl  = lyr.scale.value;
            var sx   = scl[0] / 100, sy = scl[1] / 100;
            var dax  = (ax - oldA[0]) * sx;
            var day  = (ay - oldA[1]) * sy;
            var newP = (oldP.length === 3)
                ? [oldP[0] + dax, oldP[1] + day, oldP[2]]
                : [oldP[0] + dax, oldP[1] + day];
            if (lyr.position.numKeys > 0) {
                lyr.position.setValueAtTime(comp.time, newP);
            } else {
                lyr.position.setValue(newP);
            }
        }
    } catch(e) { app.endUndoGroup(); return err(e.toString()); }
    app.endUndoGroup();
    return ok("Done");
}

function createNull(parentSelected) {
    var comp = getComp();
    if (!comp) return err("No active composition");
    app.beginUndoGroup("LTP: Create Null");
    try {
        var sel = comp.selectedLayers;

        if (parentSelected && sel.length > 0) {
            // Parent mode: one null spanning all selected, parented to topmost
            var topLayer = sel[0];
            var minIn  = sel[0].inPoint;
            var maxOut = sel[0].outPoint;
            var anyThreeD = false;
            for (var i = 0; i < sel.length; i++) {
                if (sel[i].index < topLayer.index) topLayer = sel[i];
                if (sel[i].inPoint  < minIn)  minIn  = sel[i].inPoint;
                if (sel[i].outPoint > maxOut) maxOut = sel[i].outPoint;
                if (sel[i].threeDLayer === true) anyThreeD = true;
            }
            var nul = comp.layers.addNull(comp.duration);
            nul.name = "Null";
            // Make 3D if any selected layer is 3D
            if (anyThreeD) nul.threeDLayer = true;
            // Span from earliest start to latest end
            nul.startTime = 0;
            nul.inPoint   = minIn;
            nul.outPoint  = maxOut;
            // Position = average of all selected (use Z when 3D)
            var ax = 0, ay = 0, az = 0;
            for (var i = 0; i < sel.length; i++) {
                var pv = sel[i].position.value;
                ax += pv[0];
                ay += pv[1];
                if (pv.length === 3) az += pv[2];
            }
            if (anyThreeD) {
                nul.position.setValue([ax / sel.length, ay / sel.length, az / sel.length]);
            } else {
                nul.position.setValue([ax / sel.length, ay / sel.length]);
            }
            nul.moveBefore(comp.layer(topLayer.index));
            for (var i = 0; i < sel.length; i++) sel[i].parent = nul;
        } else if (sel.length > 1) {
            // Multiple selected, no parent: one null above each selected layer
            // Sort by index ascending so moveBefore stays valid
            var sorted = [];
            for (var i = 0; i < sel.length; i++) sorted.push(sel[i]);
            sorted.sort(function(a, b) { return a.index - b.index; });
            for (var i = 0; i < sorted.length; i++) {
                var ref = sorted[i];
                var nul = comp.layers.addNull(comp.duration);
                nul.name = "Null";
                nul.inPoint  = ref.inPoint;
                nul.outPoint = ref.outPoint;
                nul.position.setValue([ref.position.value[0], ref.position.value[1]]);
                nul.moveBefore(comp.layer(ref.index));
            }
        } else if (sel.length === 1) {
            // Single selected: null above it
            var ref = sel[0];
            var nul = comp.layers.addNull(comp.duration);
            nul.name = "Null";
            nul.inPoint  = ref.inPoint;
            nul.outPoint = ref.outPoint;
            nul.position.setValue([ref.position.value[0], ref.position.value[1]]);
            nul.moveBefore(comp.layer(ref.index));
        } else {
            // Nothing selected: null at top, center
            var nul = comp.layers.addNull(comp.duration);
            nul.name = "Null";
            nul.position.setValue([comp.width / 2, comp.height / 2]);
            nul.moveToBeginning();
        }
    } catch(e) { app.endUndoGroup(); return err(e.toString()); }
    app.endUndoGroup();
    return ok("Null created");
}

function addLayer(type) {
    var comp = getComp();
    if (!comp) return err("No active composition");
    app.beginUndoGroup("LTP: Add " + type);
    try {
        var sel = comp.selectedLayers;
        var w = comp.width, h = comp.height;

        function makeLayer() {
            var lyr;
            if (type === 'adjustment') {
                lyr = comp.layers.addSolid([1,1,1], "Adjustment Layer",
                    w, h, comp.pixelAspect, comp.duration);
                lyr.adjustmentLayer = true;
            } else if (type === 'solid') {
                lyr = comp.layers.addSolid([0.18,0.18,0.18], "Solid",
                    w, h, comp.pixelAspect, comp.duration);
            }
            return lyr;
        }

        if (sel.length > 1) {
            // Multiple selected: one new layer above each
            var sorted = [];
            for (var i = 0; i < sel.length; i++) sorted.push(sel[i]);
            sorted.sort(function(a, b) { return a.index - b.index; });
            for (var i = 0; i < sorted.length; i++) {
                var ref = sorted[i];
                var newLayer = makeLayer();
                newLayer.inPoint  = ref.inPoint;
                newLayer.outPoint = ref.outPoint;
                newLayer.moveBefore(comp.layer(ref.index));
            }
        } else if (sel.length === 1) {
            // Single selected: above it, always at comp size (don't match source layer)
            var ref = sel[0];
            var newLayer = makeLayer();
            newLayer.inPoint  = ref.inPoint;
            newLayer.outPoint = ref.outPoint;
            newLayer.moveBefore(comp.layer(ref.index));
        } else {
            // Nothing selected: add at top
            makeLayer();
        }
    } catch(e) { app.endUndoGroup(); return err(e.toString()); }
    app.endUndoGroup();
    return ok(type + " added");
}

// -- ZOOM TRANSITIONS -----------------------------------------
// -- WARP STABILIZER ------------------------------------------
function applyWarpStabilizer(optJSON) {
    var opts = optJSON ? JSON.parse(optJSON) : {};
    var comp = getComp();
    if (!comp) return err("No active composition");

    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");

    var smoothness = opts.smoothness || 50;
    var method     = opts.method     || 6;   // 6=Subspace Warp
    var crop       = opts.crop       || 3;   // 3=Stabilize,Crop,Auto-scale

    app.beginUndoGroup("LTP: Warp Stabilizer");
    try {
        for (var i = 0; i < layers.length; i++) {
            var lyr = layers[i];

            // Check if layer has keyframes or expressions -> needs pre-comp
            var needPrecomp = false;
            try {
                var props = ["ADBE Transform Group"];
                for (var pi = 0; pi < props.length; pi++) {
                    var pg = lyr.property(props[pi]);
                    if (pg) {
                        for (var pp = 1; pp <= pg.numProperties; pp++) {
                            var p = pg.property(pp);
                            try {
                                if (p.numKeys > 0 || (p.expression && p.expression !== "")) {
                                    needPrecomp = true;
                                    break;
                                }
                            } catch(e_) {}
                        }
                    }
                    if (needPrecomp) break;
                }
                // Also check effects
                var efx = lyr.property("ADBE Effect Parade");
                if (efx && efx.numProperties > 0) needPrecomp = true;
            } catch(e_) {}

            var targetLyr = lyr;
            if (needPrecomp) {
                var idx = lyr.index;
                var precompName = lyr.name + " [Precomp]";
                var origIn = lyr.inPoint;
                var origOut = lyr.outPoint;
                var lyrDur = origOut - origIn;
                var precompComp = comp.layers.precompose([idx], precompName, true);

                // Shift the inner layer so its visible content starts at time 0
                // in the new precomp — otherwise shortening the precomp would
                // clip the inner footage out of view.
                try {
                    var inner = precompComp.layer(1);
                    if (inner.inPoint !== 0) {
                        inner.startTime = inner.startTime - inner.inPoint;
                    }
                } catch(e_) {}

                // Shorten the precomp to the layer's visible duration so
                // Warp Stabilizer analyses only those frames.
                precompComp.duration = lyrDur;

                // Re-anchor the parent precomp-layer back to the original
                // time slot. AE's precompose with moveAllAttributes=true
                // resets the parent layer to startTime=0 covering the whole
                // parent comp — without this it would visually jump to the
                // start of the timeline.
                targetLyr = comp.layer(idx);
                try {
                    // outPoint first; AE clamps inPoint when startTime moves
                    targetLyr.startTime = origIn;
                    targetLyr.inPoint   = origIn;
                    targetLyr.outPoint  = origOut;
                } catch(e_) {}
            }

            // Add Warp Stabilizer effect
            var efxP = targetLyr.property("ADBE Effect Parade");
            var ws = null;
            try { ws = efxP.addProperty("Warp Stabilizer VFX"); } catch(e1) {
                try { ws = efxP.addProperty("ADBE Warp Stabilizer VFX"); } catch(e2) {
                    try { ws = efxP.addProperty("Warp Stabilizer"); } catch(e3) {
                        try { ws = efxP.addProperty("ADBE Warp Stabilizer"); } catch(e4) {
                            throw new Error("Warp Stabilizer not found");
                        }
                    }
                }
            }

            // Set parameters -- navigate into property groups
            if (ws) {
                // Helper: find property by name in effect tree (up to 2 levels deep)
                var setPropByName = function(effect, name, val) {
                    for (var gi = 1; gi <= effect.numProperties; gi++) {
                        var g = effect.property(gi);
                        try {
                            if (g.name === name) { g.setValue(val); return true; }
                        } catch(e_) {}
                        try {
                            if (g.numProperties) {
                                for (var si = 1; si <= g.numProperties; si++) {
                                    var s = g.property(si);
                                    try {
                                        if (s.name === name) { s.setValue(val); return true; }
                                    } catch(e_) {}
                                }
                            }
                        } catch(e_) {}
                    }
                    return false;
                };
                setPropByName(ws, "Smoothness", smoothness);
                setPropByName(ws, "Method", method);
                setPropByName(ws, "Framing", crop);
            }

            targetLyr.selected = true;
        }
    } catch(e) {
        app.endUndoGroup();
        return err("Warp Stabilizer: " + e.toString());
    }

    app.endUndoGroup();
    return ok("Warp Stabilizer applied" + (needPrecomp ? " (pre-composed)" : ""));
}

// -- BEAT MARKERS ---------------------------------------------
// Tempo-locked beat detection. Reads amplitude from AE's built-in
// "Convert Audio to Keyframes", computes an onset envelope (positive
// deltas only), runs autocorrelation over the 60..200 BPM range to
// find the dominant beat period, then anchors a regular grid by
// phase-locking to the strongest onset. Density sub-samples the
// grid; sensitivity controls how many off-grid accent hits we add
// on top of the grid.
function placeBeatMarkers(optJSON) {
    var opts = optJSON ? JSON.parse(optJSON) : {};
    var sensitivity = Math.max(1, Math.min(10, opts.sensitivity || 5));
    var density     = Math.max(1, opts.density || 1);
    var leadFrames  = 3; // fixed: marker drops 3 frames before each beat
    var detectedBpm = 0;

    var comp = getComp();
    if (!comp) return err("No active composition");

    // Find the target audio layer: selected audio takes priority,
    // otherwise first enabled audio layer in the comp.
    var audioLayer = null;
    var sel = comp.selectedLayers;
    for (var s = 0; s < sel.length; s++) {
        if (sel[s].hasAudio && sel[s].audioEnabled) { audioLayer = sel[s]; break; }
    }
    if (!audioLayer) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var L = comp.layer(i);
            if (L.hasAudio && L.audioEnabled && !L.guideLayer) { audioLayer = L; break; }
        }
    }
    if (!audioLayer) return err("No audio layer found in composition");

    app.beginUndoGroup("LTP: Beat Markers");
    var addedCount = 0;
    try {
        // Save previous selection so we can restore it after the menu command
        var prevSelIdx = [];
        for (var i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).selected) prevSelIdx.push(i);
        }

        // Convert Audio to Keyframes needs ONLY the audio layer selected
        for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        audioLayer.selected = true;

        var beforeCount = comp.numLayers;
        var menuId = app.findMenuCommandId("Convert Audio to Keyframes");
        if (!menuId) {
            app.endUndoGroup();
            return err("Menu command 'Convert Audio to Keyframes' not found (English AE required)");
        }
        app.executeCommand(menuId);
        if (comp.numLayers <= beforeCount) {
            app.endUndoGroup();
            return err("Convert Audio to Keyframes did not produce a layer");
        }
        // Newly added Audio Amplitude null sits at the top (index 1)
        var ampLayer = comp.layer(1);

        // Find the slider with keyframes (Both Channels is what we want;
        // it sits inside the third effect group on the null).
        var efx = ampLayer.property("ADBE Effect Parade");
        var bothSlider = null;
        for (var ei = 1; ei <= efx.numProperties; ei++) {
            var e = efx.property(ei);
            // Match "Both Channels" by name; falls back to last effect if localized
            if (e.name === "Both Channels") {
                try { bothSlider = e.property(1); } catch(_) {}
                break;
            }
        }
        if (!bothSlider) {
            try { bothSlider = efx.property(efx.numProperties).property(1); } catch(_) {}
        }
        if (!bothSlider || bothSlider.numKeys === 0) {
            try { ampLayer.remove(); } catch(_) {}
            app.endUndoGroup();
            return err("No audio keyframes generated");
        }

        // Collect keyframe times + values
        var n = bothSlider.numKeys;
        var times = new Array(n);
        var vals  = new Array(n);
        for (var k = 1; k <= n; k++) {
            times[k-1] = bothSlider.keyTime(k);
            vals[k-1]  = bothSlider.keyValue(k);
        }

        // Onset envelope: positive deltas only. Amplifies the moment a
        // drum/bass hit ATTACKS instead of just being loud — which is
        // what makes a beat feel like a beat.
        var onset = new Array(n);
        onset[0] = 0;
        for (var i = 1; i < n; i++) {
            var d = vals[i] - vals[i-1];
            onset[i] = d > 0 ? d : 0;
        }
        // Light 3-tap smoothing to damp single-frame noise
        var env = new Array(n);
        env[0] = onset[0]; env[n-1] = onset[n-1];
        for (var i = 1; i < n - 1; i++) {
            env[i] = (onset[i-1] + onset[i] + onset[i+1]) / 3;
        }

        // Autocorrelation over plausible BPM range (60..240 BPM).
        // Store every correlation so we can do an octave-correction pass.
        var fr = comp.frameDuration;
        var fps = 1 / fr;
        var minLag = Math.max(3, Math.floor(60 * fps / 240));
        var maxLag = Math.min(n - 2, Math.floor(60 * fps / 60));
        var corrs = new Array(maxLag + 1);
        var bestLag = minLag, bestCorr = -1;
        for (var lag = minLag; lag <= maxLag; lag++) {
            var s = 0;
            for (var i = 0; i + lag < n; i++) s += env[i] * env[i+lag];
            corrs[lag] = s;
            if (s > bestCorr) { bestCorr = s; bestLag = lag; }
        }

        // Octave correction: autocorrelation peaks at every multiple of
        // the true period, so a 140-BPM track often "wins" at lag=70-BPM
        // (every other beat). If half the winning lag still scores ≥80%
        // of the max, prefer the faster tempo — same beat phase, twice
        // the resolution. Apply iteratively so 60 → 120 → 240 if needed.
        var TARGET_BPM = 130; // bias toward common edit tempos
        while (true) {
            var halfLag = Math.floor(bestLag / 2);
            if (halfLag < minLag) break;
            var halfCorr = corrs[halfLag] || 0;
            if (halfCorr < bestCorr * 0.80) break;
            // Prefer the faster tempo only if it's still in a musically
            // sensible range (60 BPM at the high end of comfortable cuts).
            var newBpm = 60 * fps / halfLag;
            if (newBpm > 220) break;
            bestLag = halfLag;
            bestCorr = halfCorr;
        }
        detectedBpm = Math.round(60 * fps / bestLag);

        // Find the FIRST proper beat: walk from the start, take the first
        // local maximum that's at least mean + 1σ. Plain "loudest in the
        // first 4 beats" was unreliable on tracks with weak intros.
        var statsSum = 0, statsSq = 0;
        for (var i = 0; i < n; i++) { statsSum += env[i]; statsSq += env[i]*env[i]; }
        var envMean = statsSum / n;
        var envSd = Math.sqrt(Math.max(0, statsSq/n - envMean*envMean));
        var anchorThr = envMean + envSd; // 1σ above mean
        var anchorIdx = -1;
        for (var i = 1; i < n - 1; i++) {
            if (env[i] >= anchorThr && env[i] >= env[i-1] && env[i] >= env[i+1]) {
                anchorIdx = i;
                break;
            }
        }
        if (anchorIdx < 0) {
            // Fallback: strongest onset anywhere
            var maxV = -1;
            for (var i = 0; i < n; i++) {
                if (env[i] > maxV) { maxV = env[i]; anchorIdx = i; }
            }
        }

        // Build the grid STARTING from the anchor and stepping forward
        // by one beat at a time. After each snap we re-anchor from the
        // snapped position — this keeps the grid locked to actual beats
        // even if the autocorrelation tempo is slightly off.
        var snapWin = Math.max(2, Math.floor(bestLag * 0.15));
        var grid = [];
        var pos = anchorIdx;
        while (pos < n) {
            var maxIdx = pos, lmV = env[pos] || 0;
            var lo = pos - snapWin; if (lo < 0) lo = 0;
            var hi = pos + snapWin; if (hi > n-1) hi = n-1;
            for (var k = lo; k <= hi; k++) {
                if (env[k] > lmV) { lmV = env[k]; maxIdx = k; }
            }
            grid.push(maxIdx);
            pos = maxIdx + bestLag; // re-anchor: next beat is one period from where THIS one actually landed
        }

        // Density: keep every Nth grid beat
        var kept = [];
        for (var i = 0; i < grid.length; i += density) kept.push(grid[i]);

        // Extras: at higher sensitivity, add strong off-grid onsets so
        // missed beats, drum fills and cymbal crashes also get marked.
        //   Sensitivity 1  → no extras (pure grid)
        //   Sensitivity 5  → mean + 1.8σ, must sit ≥ 0.45-beat from grid
        //   Sensitivity 10 → mean + 0.9σ, must sit ≥ 0.40-beat from grid
        // Tuned conservatively — extras should look like *missed beats*,
        // not a second layer on top of the grid. If the grid itself is
        // wrong, fixing octave correction beats more aggressive extras.
        if (sensitivity > 1) {
            var sum = 0, sumsq = 0;
            for (var i = 0; i < n; i++) { sum += env[i]; sumsq += env[i]*env[i]; }
            var mean = sum / n;
            var sd = Math.sqrt(Math.max(0, sumsq/n - mean*mean));
            // Threshold curve: 2.8σ at sens=2, 0.9σ at sens=10
            var kFactor = 2.8 - (sensitivity - 2) * (1.9 / 8);
            var thr = mean + kFactor * sd;
            // Exclusion zone: 0.45-beat at sens=2, 0.40-beat at sens=10
            var exclusionFrac = 0.45 - (sensitivity - 2) * (0.05 / 8);
            var minDist = Math.max(1, Math.floor(bestLag * exclusionFrac));
            for (var i = 1; i < n - 1; i++) {
                if (env[i] < thr) continue;
                if (env[i] < env[i-1] || env[i] < env[i+1]) continue;
                var farEnough = true;
                for (var j = 0; j < kept.length; j++) {
                    if (Math.abs(i - kept[j]) < minDist) { farEnough = false; break; }
                }
                if (farEnough) kept.push(i);
            }
            kept.sort(function(a,b){return a-b;});
        }

        // Cleanup auto-generated null
        try { ampLayer.remove(); } catch(_) {}

        // Restore previous selection
        for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
        for (var pi = 0; pi < prevSelIdx.length; pi++) {
            try { comp.layer(prevSelIdx[pi]).selected = true; } catch(_) {}
        }

        // Drop comp markers `leadFrames` frames before each beat so the
        // editor can cut/anchor ahead of the hit (visual lands ON the
        // downbeat). Negative values shift markers AFTER the beat.
        var leadOffset = fr * leadFrames;
        var mp = comp.markerProperty;
        for (var i = 0; i < kept.length; i++) {
            var t = times[kept[i]] - leadOffset;
            if (t < 0) t = 0;
            mp.setValueAtTime(t, new MarkerValue(""));
        }
        addedCount = kept.length;
    } catch(e) {
        app.endUndoGroup();
        return err("Beat Markers: " + e.toString());
    }
    app.endUndoGroup();
    return ok("Placed " + addedCount + " marker" + (addedCount === 1 ? "" : "s") +
              (detectedBpm ? " @ ~" + detectedBpm + " BPM" : ""));
}

function clearCompMarkers() {
    var comp = getComp();
    if (!comp) return err("No active composition");
    app.beginUndoGroup("LTP: Clear Comp Markers");
    try {
        var mp = comp.markerProperty;
        while (mp.numKeys > 0) mp.removeKey(mp.numKeys);
    } catch(e) {
        app.endUndoGroup();
        return err("Clear Markers: " + e.toString());
    }
    app.endUndoGroup();
    return ok("Markers cleared");
}

function applyZoom(type, dir) {
    // type: "in" (zoom in) or "out" (zoom out)
    // dir:  "in" (end of layer) or "out" (start of layer)
    var comp = getComp();
    if (!comp) return err("No active composition");

    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");

    var fr = comp.frameRate;
    var dur = 7 / fr; // 7 frames

    var sclFrom, sclTo;
    if (type === "in" && dir === "in")   { sclFrom = 100; sclTo = 150; }
    if (type === "in" && dir === "out")  { sclFrom = 50;  sclTo = 100; }
    if (type === "out" && dir === "in")  { sclFrom = 100; sclTo = 50;  }
    if (type === "out" && dir === "out") { sclFrom = 150; sclTo = 100; }

    app.beginUndoGroup("LTP: Zoom " + type + " " + dir);
    try {
        var refLyr = layers[0];

        // Time range
        var t1, t2;
        if (dir === "in") {
            t2 = refLyr.outPoint;
            t1 = t2 - dur;
        } else {
            t1 = refLyr.inPoint;
            t2 = t1 + dur;
        }

        // Adjustment layer
        var adj = comp.layers.addSolid(
            [0, 0, 0], "Zoom " + type.toUpperCase() + " (LTP)",
            comp.width, comp.height, 1, dur
        );
        adj.adjustmentLayer = true;
        adj.startTime = t1;
        adj.inPoint   = t1;
        adj.outPoint  = t2;
        adj.moveBefore(refLyr);
        adj.motionBlur = true;
        comp.motionBlur = true;

        var efx = adj.property("ADBE Effect Parade");

        // Motion Tile -- mirror edges, 300% output
        try {
            var mt = efx.addProperty("ADBE Motion Tile");
            mt.property("ADBE Motion Tile-0004").setValue(300);
            mt.property("ADBE Motion Tile-0005").setValue(300);
            mt.property("ADBE Motion Tile-0006").setValue(1);
        } catch(eMT) {
            try {
                var mt2 = efx.addProperty("Motion Tile");
                mt2.property(4).setValue(300);
                mt2.property(5).setValue(300);
                mt2.property(6).setValue(1);
            } catch(eMT2) {}
        }

        // Transform effect -- scale keyframes
        var tf = efx.addProperty("ADBE Geometry2");
        var cx = comp.width / 2;
        var cy = comp.height / 2;
        try { tf.property(1).setValue([cx, cy]); } catch(eAP) {}

        // Uniform Scale ON
        try { tf.property(3).setValue(1); } catch(eUS) {}

        var sclProp = tf.property(4); // Scale Height (uniform)
        sclProp.setValueAtTime(t1, sclFrom);
        sclProp.setValueAtTime(t2, sclTo);

        // Value graph: sharp ease-in for "in", mirrored ease-out for "out"
        sclProp.setInterpolationTypeAtKey(1,
            KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
        sclProp.setInterpolationTypeAtKey(2,
            KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);

        var avgSpd = Math.abs(sclTo - sclFrom) / dur;
        if (dir === "in") {
            // Ease IN: flat start -> steep end
            sclProp.setTemporalEaseAtKey(1, [new KeyframeEase(0, 90)], [new KeyframeEase(0, 90)]);
            sclProp.setTemporalEaseAtKey(2, [new KeyframeEase(avgSpd * 3, 10)], [new KeyframeEase(avgSpd * 3, 10)]);
        } else {
            // Ease OUT: steep start -> flat end
            sclProp.setTemporalEaseAtKey(1, [new KeyframeEase(avgSpd * 3, 10)], [new KeyframeEase(avgSpd * 3, 10)]);
            sclProp.setTemporalEaseAtKey(2, [new KeyframeEase(0, 90)], [new KeyframeEase(0, 90)]);
        }

        adj.selected = true;
    } catch(e) {
        app.endUndoGroup();
        return err("Zoom: " + e.toString());
    }

    app.endUndoGroup();
    return ok("Zoom " + type + " " + dir + " applied");
}

// -- SHAKES ----------------------------------------------------
function applyShake(optJSON) {
    var opts = JSON.parse(optJSON);
    var comp = getComp();
    if (!comp) return err("No active composition");

    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");

    var ampH    = opts.horizontal || 0;
    var ampV    = opts.vertical   || 0;
    var ampS    = opts.scale      || 0;
    var ampW    = opts.warp       || 0;
    var ampR    = opts.rotation   || 0;
    var doFlash = opts.flash      || false;
    var doChroma = opts.chromaShift !== false;
    var durF    = opts.duration   || 10;
    var dur     = durF / comp.frameRate;

    var refLyr  = layers[0];
    var startT  = refLyr.inPoint;
    var shakeLen = dur;

    // Deselect all layers first
    for (var dl = 1; dl <= comp.numLayers; dl++) comp.layer(dl).selected = false;

    // -- 5-keyframe pattern --
    // Frame positions as ratios: 0%, 17%, 50%, 75%, 100%
    var fRat = [0, 0.167, 0.5, 0.75, 1.0];
    // Vertical oscillation: impact DOWN -> big bounce UP -> settle
    var oscV = [0.47, -1.0, 0.33, -0.16, 0];
    // Horizontal oscillation: phase-shifted relative to V so the combined
    // motion traces a loop instead of a single diagonal line. Same impact
    // envelope (big hit then decay), but the per-keyframe (H,V) pairs
    // now point in 4 different directions across the shake.
    var oscH = [-1.0, 0.33, 0.47, -0.16, 0];
    // Smooth decay for blur/scale/FOV
    var dcy = [1.0, 0.6, 0.37, 0.22, 0];

    // Peak displacement = amp * 0.4 (matched to user reference data)
    var peakH = ampH * 0.4;
    var peakV = ampV * 0.4;

    var hasShake = (ampH > 0 || ampV > 0 || ampS > 0 || ampW > 0 || ampR > 0);

    app.beginUndoGroup("LTP: Shake");

    // -- 1. Shake Adjustment Layer (skip if flash-only) --
    var adj = null;
    if (hasShake) try {
        adj = comp.layers.addSolid(
            [0, 0, 0], "Shake (LTP)",
            comp.width, comp.height, 1, shakeLen
        );
        adj.adjustmentLayer = true;
        adj.startTime = startT;
        adj.inPoint   = startT;
        adj.outPoint  = startT + shakeLen;
        adj.moveBefore(refLyr);

        adj.motionBlur = true;
        comp.motionBlur = true;

        var efx = adj.property("ADBE Effect Parade");

        // Motion Tile -- mirror edges
        try {
            var mt = efx.addProperty("ADBE Motion Tile");
            mt.property("ADBE Motion Tile-0004").setValue(180);
            mt.property("ADBE Motion Tile-0005").setValue(180);
            mt.property("ADBE Motion Tile-0006").setValue(1);
        } catch(eMT) {
            try {
                var mt2 = efx.addProperty("Motion Tile");
                mt2.property(4).setValue(180);
                mt2.property(5).setValue(180);
                mt2.property(6).setValue(1);
            } catch(eMT2) {}
        }

        // Transform effect
        var tf = efx.addProperty("ADBE Geometry2");
        var cx = comp.width / 2;
        var cy = comp.height / 2;
        try { tf.property(1).setValue([cx, cy]); } catch(eAP) {}

        // Position -- only if H or V active (5 keyframes)
        if (ampH > 0 || ampV > 0) {
            try {
                var posProp = tf.property(2);
                for (var p = 0; p < 5; p++) {
                    var tP = startT + fRat[p] * dur;
                    var ox = ampH > 0 ? peakH * oscH[p] : 0;
                    var oy = ampV > 0 ? peakV * oscV[p] : 0;
                    posProp.setValueAtTime(tP, [cx + ox, cy + oy]);
                }
            } catch(ePos) {}
        }

        // Rotation -- use first Transform effect, find rotation by scanning
        if (ampR > 0) {
            var rotProp = null;
            var dbgProps = '';
            for (var ri = 1; ri <= tf.numProperties; ri++) {
                var rpName = tf.property(ri).name;
                dbgProps += ri + ':' + rpName + ' ';
                if (!rotProp && rpName.toLowerCase().indexOf('rotat') >= 0) {
                    rotProp = tf.property(ri);
                }
            }
            if (!rotProp) {
                // Store debug info but don't fail the whole shake
                adj.name = "Shake (LTP) [ROT ERR: " + dbgProps + "]";
            } else {
                var rotOsc = [0.47, -1.0, 0.33, -0.16, 0];
                var peakRot = ampR * 0.35;
                for (var rr = 0; rr < 5; rr++) {
                    rotProp.setValueAtTime(startT + fRat[rr] * dur, peakRot * rotOsc[rr]);
                }
            }
        }

        // Scale -- non-proportional wiggle (Height vs Width opposite)
        if (ampS > 0) {
            try {
                // Uniform Scale OFF -> animate H and W separately
                try { tf.property(3).setValue(0); } catch(eUS) {}
                var sclH = tf.property(4); // Scale Height
                var sclW = tf.property(5); // Scale Width
                // Softer & faster oscillation: ends at 50% of shake duration
                var sOscH = [0.5, -0.3, 0.15, -0.06, 0];
                var sOscW = [-0.25, 0.2, -0.1, 0.04, 0];
                var sFRat = [0, 0.16, 0.4, 0.64, 0.8];
                for (var s = 0; s < 5; s++) {
                    var tS = startT + sFRat[s] * dur;
                    sclH.setValueAtTime(tS, 100 + ampS * sOscH[s]);
                    sclW.setValueAtTime(tS, 100 + ampS * sOscW[s]);
                }
            } catch(eScl) {}
        }

        // Optics Compensation -- 2 keyframes: full at start, 0 at end of adj layer
        if (ampS > 0 || ampW > 0) {
            try {
                var oc = efx.addProperty("ADBE Optics Compensation");
                try { oc.property(2).setValue(1); } catch(eRL) {}
                var fovProp = oc.property(1);
                var fovBase = ampW > 0 ? ampW : 75;
                fovProp.setValueAtTime(startT, fovBase);
                fovProp.setValueAtTime(startT + dur, 0);
            } catch(eOC) {}
        }

        // Directional Blur -- 2 keyframes: full at start, 0 at half duration
        if (ampH > 0 || ampV > 0) {
            try {
                var dbNames = ["Directional Blur", "ADBE Directional Blur", "ADBE Direct Blur"];
                var db = null;
                for (var dn = 0; dn < dbNames.length; dn++) {
                    try { db = efx.addProperty(dbNames[dn]); break; } catch(eTry) {}
                }
                if (db) {
                    var dbDir = db.property(1);
                    var dbLen = db.property(2);
                    var halfT = startT + dur * 0.5;
                    // Direction based on dominant axis
                    var blurAngle = 0;
                    if (ampH > 0 && ampV > 0) {
                        blurAngle = Math.atan2(peakV, peakH) * 180 / Math.PI;
                    } else if (ampH > 0) {
                        blurAngle = 90;
                    }
                    dbDir.setValueAtTime(startT, blurAngle);
                    dbLen.setValueAtTime(startT, 60);
                    dbLen.setValueAtTime(halfT, 0);
                }
            } catch(eDB) {}
        }

        // Chromatic Shift -- only if enabled AND position active (5 keyframes)
        if (doChroma && (ampH > 0 || ampV > 0)) {
            try {
                var chb = efx.addProperty("ADBE Channel Blur");
                var rBlur = chb.property(1);
                var bBlur = chb.property(3);
                try { chb.property(5).setValue(1); } catch(eRep) {}
                for (var c = 0; c < 5; c++) {
                    var tC = startT + fRat[c] * dur;
                    var dispH = ampH > 0 ? Math.abs(peakH * oscH[c]) : 0;
                    var dispV = ampV > 0 ? Math.abs(peakV * oscV[c]) : 0;
                    var disp = Math.sqrt(dispH * dispH + dispV * dispV);
                    var sclOff = ampS > 0 ? ampS * dcy[c] : 0;
                    rBlur.setValueAtTime(tC, disp * 0.8 + sclOff * 1.5);
                    bBlur.setValueAtTime(tC, disp * 0.6 + sclOff * 1.2);
                }
            } catch(eCB) {}
        }

    } catch(e) {
        app.endUndoGroup();
        return err("Shake: " + e.toString());
    }

    // -- 2. Flash -- ISOLATED try/catch so it never breaks shake --
    var flashAdj = null;
    if (doFlash) {
        try {
            flashAdj = comp.layers.addSolid(
                [1, 0.85, 0.2], "Flash (LTP)",
                comp.width, comp.height, 1, shakeLen
            );
            flashAdj.adjustmentLayer = true;
            flashAdj.label = 2; // Yellow label for timeline visibility
            flashAdj.startTime = startT;
            flashAdj.inPoint   = startT;
            // Place flash above shake layer (or above ref layer if flash-only)
            if (adj) flashAdj.moveBefore(adj);
            else flashAdj.moveBefore(refLyr);

            var flashEfx = flashAdj.property("ADBE Effect Parade");
            var bc = flashEfx.addProperty("ADBE Brightness & Contrast 2");
            var brProp = bc.property(1); // Brightness
            var flashEnd = startT + shakeLen / 3;
            brProp.setValueAtTime(startT, 150);
            brProp.setValueAtTime(flashEnd, 0);
            brProp.setInterpolationTypeAtKey(1,
                KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            brProp.setInterpolationTypeAtKey(2,
                KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
            // Trim flash layer to last keyframe
            flashAdj.outPoint = flashEnd;
        } catch(eFlash) {
            // Flash failed but shake still works
        }
    }

    // Select newly created layers
    try {
        if (adj) adj.selected = true;
        if (flashAdj) flashAdj.selected = true;
    } catch(eSel) {}

    app.endUndoGroup();
    return ok("Shake H=" + ampH + " V=" + ampV + " S=" + ampS + " W=" + ampW + " R=" + ampR);
}

// -- TAB 4: ALIGN LAYERS --------------------------------------
function alignLayers(mode, alignTo) {
    var comp = getComp();
    if (!comp) return err("No active composition");

    var layers = comp.selectedLayers;
    if (!layers.length) return err("No layers selected");

    // Single layer: always align to comp
    if (layers.length === 1) alignTo = 'comp';

    // Helper: set position even if keyframed
    function setPos(lyr, val) {
        if (lyr.position.numKeys > 0) {
            lyr.position.setValueAtTime(comp.time, val);
        } else {
            lyr.position.setValue(val);
        }
    }

    app.beginUndoGroup("LTP: Align");
    try {
        var infos = [];
        for (var i = 0; i < layers.length; i++) {
            var lyr  = layers[i];
            var rect = getVisibleRect(lyr, comp.time);

            var pos  = lyr.position.value;
            var anc  = lyr.anchorPoint.value;
            var scl  = lyr.scale.value;
            var sx   = scl[0] / 100, sy = scl[1] / 100;
            var w    = rect.width * sx, h = rect.height * sy;
            var left = pos[0] + (rect.left - anc[0]) * sx;
            var top  = pos[1] + (rect.top  - anc[1]) * sy;
            infos.push({ lyr:lyr, pos:pos, anc:anc, sx:sx, sy:sy,
                rect:rect, w:w, h:h, left:left, top:top,
                right:left+w, bottom:top+h, cx:left+w/2, cy:top+h/2 });
        }

        var rL, rR, rT, rB, rCX, rCY;
        if (alignTo === 'comp') {
            rL=0; rR=comp.width; rT=0; rB=comp.height;
            rCX=comp.width/2; rCY=comp.height/2;
        } else {
            rL=Infinity; rR=-Infinity; rT=Infinity; rB=-Infinity;
            for (var i=0;i<infos.length;i++){
                var n=infos[i];
                if(n.left<rL)rL=n.left; if(n.right>rR)rR=n.right;
                if(n.top<rT)rT=n.top;   if(n.bottom>rB)rB=n.bottom;
            }
            rCX=(rL+rR)/2; rCY=(rT+rB)/2;
        }

        if (mode !== 'distH' && mode !== 'distV') {
            for (var i=0;i<infos.length;i++){
                var n=infos[i], np=[n.pos[0],n.pos[1]];
                // Offset from anchor to rect origin (handles mask offset)
                var ofsX = (n.anc[0] - n.rect.left) * n.sx;
                var ofsY = (n.anc[1] - n.rect.top)  * n.sy;
                if      (mode==='left')    np[0]=rL  + ofsX;
                else if (mode==='hcenter') np[0]=rCX - n.w/2 + ofsX;
                else if (mode==='right')   np[0]=rR  - n.w   + ofsX;
                else if (mode==='top')     np[1]=rT  + ofsY;
                else if (mode==='vcenter') np[1]=rCY - n.h/2 + ofsY;
                else if (mode==='bottom')  np[1]=rB  - n.h   + ofsY;
                setPos(n.lyr,np);
            }
        } else {
            if (infos.length < 2) { app.endUndoGroup(); return err("Need 2+ layers"); }
            if (mode==='distH') {
                infos.sort(function(a,b){return a.left-b.left;});
                var totalW=0;
                for(var i=0;i<infos.length;i++) totalW+=infos[i].w;
                var totalSpan=infos[infos.length-1].right-infos[0].left;
                var gap=(totalSpan-totalW)/(infos.length-1);
                var cursor=infos[0].left;
                for(var i=0;i<infos.length;i++){
                    var n=infos[i];
                    var ofsX=(n.anc[0]-n.rect.left)*n.sx;
                    setPos(n.lyr,[cursor+ofsX, n.pos[1]]);
                    cursor+=n.w+gap;
                }
            } else {
                infos.sort(function(a,b){return a.top-b.top;});
                var totalH=0;
                for(var i=0;i<infos.length;i++) totalH+=infos[i].h;
                var totalSpan=infos[infos.length-1].bottom-infos[0].top;
                var gap=(totalSpan-totalH)/(infos.length-1);
                var cursor=infos[0].top;
                for(var i=0;i<infos.length;i++){
                    var n=infos[i];
                    var ofsY=(n.anc[1]-n.rect.top)*n.sy;
                    setPos(n.lyr,[n.pos[0], cursor+ofsY]);
                    cursor+=n.h+gap;
                }
            }
        }
    } catch(e) { app.endUndoGroup(); return err(e.toString()); }
    app.endUndoGroup();
    return ok("Done");
}
