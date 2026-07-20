    window.addEventListener('error', function (e) {
      var t = e.target;
      if (t && t.tagName === 'IMG' && t.src.indexOf('images/placeholder.svg') === -1) {
        t.src = '/images/placeholder.svg';
      }
    }, true);
