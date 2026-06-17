'use strict';

/**
 * XYZ Tool — Auto-Updater Module
 * Checks for updates via Cloudflare Pages, shows changelog,
 * downloads + installs via ExtendScript system calls.
 */

var Updater = (function() {

  var APP_VERSION = '1.2.15';
  var UPDATE_URL  = 'https://360mediaedits.com/updates.json';

  var _manifest = null;
  var _updateAvailable = false;

  // ── Version compare (semver-like) ──────────────────────────
  function cmpVer(a, b) {
    var pa = a.split('.'), pb = b.split('.');
    for (var i = 0; i < 3; i++) {
      var na = parseInt(pa[i] || '0', 10);
      var nb = parseInt(pb[i] || '0', 10);
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
    return 0;
  }

  // ── Check for updates ─────────────────────────────────────
  function checkForUpdates(callback) {
    fetch(UPDATE_URL + '?t=' + Date.now())
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _manifest = data;
        _updateAvailable = cmpVer(data.latest, APP_VERSION) > 0;
        if (callback) callback(null, {
          available: _updateAvailable,
          latest: data.latest,
          current: APP_VERSION,
          versions: data.versions || [],
        });
      })
      .catch(function(err) {
        if (callback) callback(err.message || 'Network error');
      });
  }

  // ── Getters ───────────────────────────────────────────────
  function isUpdateAvailable() { return _updateAvailable; }
  function getLatestVersion()  { return _manifest ? _manifest.latest : APP_VERSION; }
  function getChangelog()      { return _manifest ? (_manifest.versions || []) : []; }

  // ── Build changelog HTML ──────────────────────────────────
  function buildChangelogHTML() {
    var versions = getChangelog();
    if (!versions.length) return '<div class="cl-empty">No update info available</div>';
    var html = '';
    for (var i = 0; i < versions.length; i++) {
      var v = versions[i];
      var isNew = cmpVer(v.version, APP_VERSION) > 0;
      var isCurrent = v.version === APP_VERSION;
      html += '<div class="cl-entry' + (isNew ? ' cl-new' : '') + '">';
      html += '<div class="cl-version-row">';
      html += '<span class="cl-ver">v' + v.version + '</span>';
      if (isCurrent) html += '<span class="cl-current-tag">CURRENT</span>';
      if (isNew)     html += '<span class="cl-new-tag">NEW</span>';
      if (v.date)    html += '<span class="cl-date">' + v.date + '</span>';
      html += '</div>';
      if (v.changes && v.changes.length) {
        html += '<ul class="cl-changes">';
        for (var j = 0; j < v.changes.length; j++) {
          html += '<li>' + v.changes[j] + '</li>';
        }
        html += '</ul>';
      }
      html += '</div>';
    }
    return html;
  }

  // ── Install update via ExtendScript ────────────────────────
  function installUpdate(callback) {
    if (!_manifest || !_updateAvailable) { callback('No update available'); return; }

    var url = _manifest.downloadUrl ||
      ('https://360mediaedits.com/releases/XYZTool_v' + _manifest.latest + '.zip');

    if (typeof __adobe_cep__ === 'undefined') { callback('Not in AE'); return; }

    var script = "installExtensionUpdate('" + url.replace(/'/g, "\\'") + "')";
    __adobe_cep__.evalScript(script, function(res) {
      try {
        var data = (typeof res === 'string') ? JSON.parse(res) : res;
        if (data && data.ok) {
          callback(null, data);
        } else {
          callback((data && data.error) ? data.error : 'Install failed');
        }
      } catch(e) {
        callback('Install error: ' + (res || e.message));
      }
    });
  }

  return {
    APP_VERSION:       APP_VERSION,
    checkForUpdates:   checkForUpdates,
    isUpdateAvailable: isUpdateAvailable,
    getLatestVersion:  getLatestVersion,
    getChangelog:      getChangelog,
    buildChangelogHTML: buildChangelogHTML,
    installUpdate:     installUpdate,
    cmpVer:            cmpVer,
  };

})();
