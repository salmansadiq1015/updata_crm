/*!
 * Swiss HVAC ERP — Website Widget Loader (CRM-014 AC-1)
 *
 * Embeds the public contact-form widget into any website. Two options:
 *
 * 1) Script tag (recommended — auto-injects a responsive <iframe>):
 *    <script
 *      src="https://<host>/widget-embed.js"
 *      data-widget-id="WIDGET_ID"
 *      data-host="https://<host>"   <!-- optional; defaults to the script's own origin -->
 *      data-height="720"            <!-- optional; initial iframe height in px -->
 *    ></script>
 *
 *    The script injects an <iframe> pointing at /widget/<widgetId> right after
 *    itself. If "data-host" is omitted, the host is derived from this script's src.
 *
 * 2) Plain iframe (no JavaScript):
 *    <iframe
 *      src="https://<host>/widget/WIDGET_ID"
 *      style="width:100%;border:0;height:720px"
 *      title="Kontaktformular"
 *    ></iframe>
 *
 * Dependency-free, defensive against double-injection.
 */
(function () {
  'use strict';

  // `document.currentScript` resolves to this script element during execution.
  var script = document.currentScript;
  if (!script) {
    // Fallback: pick the last <script> referencing this file.
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (all[i].src && all[i].src.indexOf('widget-embed.js') !== -1) {
        script = all[i];
        break;
      }
    }
  }
  if (!script) return;

  var widgetId = script.getAttribute('data-widget-id');
  if (!widgetId) {
    if (window.console && console.warn) {
      console.warn('[widget-embed] Missing required "data-widget-id" attribute.');
    }
    return;
  }

  // Resolve host: explicit data-host wins, else derive from this script's origin.
  var host = script.getAttribute('data-host');
  if (!host) {
    try {
      var url = new URL(script.src, window.location.href);
      host = url.origin;
    } catch (e) {
      host = window.location.origin;
    }
  }
  host = String(host).replace(/\/+$/, ''); // strip trailing slashes

  var height = script.getAttribute('data-height') || '720';

  // Defensive: avoid double-injection if the snippet is included more than once
  // for the same widget on a single page.
  var injectedFlag = 'data-hvac-widget-injected';
  var existing = document.querySelector(
    'iframe[' + injectedFlag + '="' + cssEscape(widgetId) + '"]'
  );
  if (existing) return;

  var src = host + '/widget/' + encodeURIComponent(widgetId);

  var iframe = document.createElement('iframe');
  iframe.src = src;
  iframe.title = 'Kontaktformular';
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute(injectedFlag, widgetId);
  iframe.style.width = '100%';
  iframe.style.border = '0';
  iframe.style.height = (/^\d+$/.test(height) ? height + 'px' : height);
  iframe.style.maxWidth = '100%';
  iframe.style.display = 'block';

  // Insert the iframe immediately after the script tag.
  if (script.parentNode) {
    script.parentNode.insertBefore(iframe, script.nextSibling);
  } else {
    document.body.appendChild(iframe);
  }

  // Minimal CSS.escape fallback for attribute-selector safety.
  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\\]]/g, '\\$&');
  }
})();
