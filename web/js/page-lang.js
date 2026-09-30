// page-lang.js — 정적 안내 페이지(about/how-to-play/items/tips/faq/contact)의
// 한/영 전환. privacy.html과 같은 방식: [data-lang-block="ko|en"] 블록 중
// 하나만 보여준다. CSS(pages.css)가 기본으로 en 블록을 숨겨 두므로, 이
// 스크립트가 실패해도 한국어 본문은 정상 표시된다.
// 언어 설정은 메인 앱(js/i18n.js)과 같은 localStorage 키를 공유한다.
(function () {
  var LANG_KEY = 'de_lang';

  function detectLang() {
    try {
      var stored = localStorage.getItem(LANG_KEY);
      if (stored === 'ko' || stored === 'en') return stored;
    } catch (e) { /* localStorage 사용 불가 */ }
    var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    return nav.indexOf('ko') === 0 ? 'ko' : 'en';
  }

  var titleEl = document.querySelector('title');
  var titles = {
    ko: titleEl ? titleEl.textContent : '',
    en: titleEl ? (titleEl.getAttribute('data-title-en') || titleEl.textContent) : ''
  };

  function applyLang(lang) {
    document.documentElement.lang = lang;
    var blocks = document.querySelectorAll('[data-lang-block]');
    for (var i = 0; i < blocks.length; i++) {
      // 'block'을 명시해야 CSS의 [data-lang-block="en"]{display:none} 기본값을 덮는다
      blocks[i].style.display = blocks[i].getAttribute('data-lang-block') === lang ? 'block' : 'none';
    }
    if (titleEl) titleEl.textContent = titles[lang];
  }

  var currentLang = detectLang();
  applyLang(currentLang);

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-lang-toggle]');
    if (!btn) return;
    currentLang = currentLang === 'ko' ? 'en' : 'ko';
    try { localStorage.setItem(LANG_KEY, currentLang); } catch (err) { /* 무시 */ }
    applyLang(currentLang);
  });

  // 다른 탭(메인 앱)에서 언어를 바꾸면 따라간다
  window.addEventListener('storage', function (e) {
    if (e.key === LANG_KEY && (e.newValue === 'ko' || e.newValue === 'en')) {
      currentLang = e.newValue;
      applyLang(currentLang);
    }
  });
})();
