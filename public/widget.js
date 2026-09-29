(function () {
  'use strict';
  if (window.AI_RECEPTIONIST_WIDGET_LOADED) return;
  window.AI_RECEPTIONIST_WIDGET_LOADED = true;

  // Determine host origin from the script tag
  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1];
    })();

  var scriptSrc = script ? script.src : '';
  var origin = '';
  try {
    var url = new URL(scriptSrc);
    origin = url.origin;
  } catch (e) {
    origin = window.location.origin;
  }

  var iframeUrl = origin + '/?embed=true&widget=true';

  // Create iframe element
  var iframe = document.createElement('iframe');
  iframe.id = 'ai-receptionist-floating-widget';
  iframe.src = iframeUrl;
  iframe.title = 'AI Dental Receptionist';
  iframe.setAttribute('allow', 'clipboard-write; microphone');
  iframe.style.position = 'fixed';
  iframe.style.bottom = '16px';
  iframe.style.right = '16px';
  iframe.style.width = '320px';
  iframe.style.height = '72px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '2147483647';
  iframe.style.background = 'transparent';
  iframe.style.colorScheme = 'none';
  iframe.style.transition = 'width 0.25s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s ease';
  iframe.style.maxWidth = '100vw';
  iframe.style.maxHeight = '100vh';

  // Listen for open/close state events dispatched from the widget inside the iframe
  window.addEventListener('message', function (event) {
    if (!event.data || event.data.type !== 'RECEPTIONIST_WIDGET_STATE') return;
    var isOpen = Boolean(event.data.isOpen);
    var isMobile = window.innerWidth < 640;

    if (isOpen) {
      if (isMobile) {
        iframe.style.width = 'calc(100vw - 16px)';
        iframe.style.height = 'calc(100vh - 24px)';
        iframe.style.bottom = '8px';
        iframe.style.right = '8px';
      } else {
        iframe.style.width = '420px';
        iframe.style.height = '680px';
        iframe.style.bottom = '16px';
        iframe.style.right = '16px';
      }
    } else {
      iframe.style.width = '320px';
      iframe.style.height = '72px';
      iframe.style.bottom = '16px';
      iframe.style.right = '16px';
    }
  });

  // Mount iframe when DOM is ready
  function mount() {
    if (!document.getElementById('ai-receptionist-floating-widget')) {
      document.body.appendChild(iframe);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
