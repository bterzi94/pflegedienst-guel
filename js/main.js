// Pflegedienst Gül – Mönchengladbach

(function () {
  'use strict';

  /* ---------- Formspark + Cloudflare Turnstile ---------- */
  /* Every form on the site posts here. Turnstile protects each one; a
     widget only renders where a [data-turnstile="<key>"] container exists
     on the page, so most pages render just one ("kontakt"), the homepage
     renders three (kontakt + both Lina chat paths), jobs.html renders
     "apply". */

  var FORMSPARK_ACTION_URL = 'https://submit-form.com/gWB1obGxN';
  var TURNSTILE_SITE_KEY = '0x4AAAAAAFPVb2XW8ZdTl6bt';

  var turnstileTokens = {};
  var turnstileWidgetIds = {};
  var turnstileChangeHandlers = {};

  function onTurnstileChange(key) {
    if (turnstileChangeHandlers[key]) turnstileChangeHandlers[key]();
  }

  function renderTurnstileWidgets() {
    if (typeof turnstile === 'undefined') return;
    document.querySelectorAll('[data-turnstile]').forEach(function (el) {
      if (el.getAttribute('data-rendered') === 'true') return;
      el.setAttribute('data-rendered', 'true');
      var key = el.getAttribute('data-turnstile');
      turnstileWidgetIds[key] = turnstile.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: function (token) {
          turnstileTokens[key] = token;
          onTurnstileChange(key);
        },
        'expired-callback': function () {
          turnstileTokens[key] = null;
          onTurnstileChange(key);
        },
        'error-callback': function () {
          turnstileTokens[key] = null;
          onTurnstileChange(key);
        },
      });
    });
  }
  window.onloadTurnstileCallback = renderTurnstileWidgets;
  // In case the Turnstile script already finished loading before this ran.
  if (typeof turnstile !== 'undefined') renderTurnstileWidgets();

  function resetTurnstile(key) {
    turnstileTokens[key] = null;
    if (typeof turnstile !== 'undefined' && turnstileWidgetIds[key] != null) {
      turnstile.reset(turnstileWidgetIds[key]);
    }
  }

  function submitToFormspark(fields, formName, turnstileKey) {
    var payload = {};
    Object.keys(fields).forEach(function (k) { payload[k] = fields[k]; });
    payload._form = formName;
    payload._page = window.location.href;
    payload['cf-turnstile-response'] = turnstileTokens[turnstileKey] || '';

    return fetch(FORMSPARK_ACTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) throw new Error('Formspark submit failed: ' + res.status);
      return res;
    });
  }

  // Same as submitToFormspark, but for forms that may include a file
  // (multipart/form-data — JSON can't carry a binary attachment).
  function submitFormDataToFormspark(formData, formName, turnstileKey) {
    formData.append('_form', formName);
    formData.append('_page', window.location.href);
    formData.append('cf-turnstile-response', turnstileTokens[turnstileKey] || '');

    return fetch(FORMSPARK_ACTION_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' }, // no Content-Type: the browser sets the multipart boundary itself
      body: formData,
    }).then(function (res) {
      if (!res.ok) throw new Error('Formspark submit failed: ' + res.status);
      return res;
    });
  }

  /* ---------- Hamburger / mobile menu ---------- */

  var hamburgerBtn = document.getElementById('hamburgerBtn');
  var mobileMenu = document.getElementById('mobileMenu');

  if (hamburgerBtn && mobileMenu) {
    hamburgerBtn.addEventListener('click', function () {
      var isOpen = hamburgerBtn.classList.toggle('is-open');
      mobileMenu.hidden = !isOpen;
      hamburgerBtn.setAttribute('aria-expanded', String(isOpen));
      hamburgerBtn.setAttribute('aria-label', isOpen ? 'Menü schließen' : 'Menü öffnen');
    });

    mobileMenu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        hamburgerBtn.classList.remove('is-open');
        mobileMenu.hidden = true;
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        hamburgerBtn.setAttribute('aria-label', 'Menü öffnen');
      }
    });
  }

  /* ---------- Mobile menu submenu toggle ---------- */
  /* Desktop "Ambulante Pflege" / "Intensivpflege" flyouts are pure CSS
     (:hover / :focus-within) — no JS needed there. */

  document.querySelectorAll('.mobile-menu-chevron-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      var group = btn.closest('.mobile-menu-group');
      var submenu = group ? group.querySelector('.mobile-submenu') : null;
      if (submenu) submenu.hidden = isOpen;
    });
  });

  /* ---------- Chat assistant "Lina" ---------- */

  var thread = document.getElementById('chatThread');
  if (thread) initChat(thread);

  function initChat(thread) {
  var TOPIC_LABELS = { home: 'Pflege zu Hause', question: 'Frage stellen' };
  var METHOD_LABELS = { callback: 'Rückruf vereinbaren', form: 'Formular ausfüllen' };
  var TIME_LABELS = { morning: 'Vormittags', afternoon: 'Nachmittags', evening: 'Abends' };

  var INITIAL_DELAY_MS = 2400;
  var TYPING_MS_FIRST = 1200;
  var TYPING_MS_STEP = 900;

  var state = {
    revealStep: null,
    typing: false,
    topic: null,
    method: null,
    callbackTime: null,
    name: '',
    phone: '',
    message: '',
    formSubmitted: false,
    callbackSubmitted: false,
    canScrollMore: false,
  };

  function $(name) {
    return thread.querySelector('[data-el="' + name + '"]');
  }
  function setText(name, value) {
    var el = thread.querySelector('[data-text="' + name + '"]');
    if (el) el.textContent = value;
  }
  function show(el, visible) {
    if (el) el.hidden = !visible;
  }

  var els = {
    greeting: $('greeting'),
    topicAnswer: $('topicAnswer'),
    topicOptions: $('topicOptions'),
    methodQuestion: $('methodQuestion'),
    methodAnswer: $('methodAnswer'),
    methodOptions: $('methodOptions'),
    callbackBlock: $('callbackBlock'),
    timeAnswer: $('timeAnswer'),
    timeOptions: $('timeOptions'),
    callbackForm: $('callbackForm'),
    callbackDone: $('callbackDone'),
    formBlock: $('formBlock'),
    formFields: $('formFields'),
    formDone: $('formDone'),
    typing: $('typing'),
  };

  var scrollHint = thread.parentElement.querySelector('[data-el="scrollHint"]');

  /* Both chat sub-forms stay disabled until their Turnstile widget clears. */
  var cbSubmitBtn = document.getElementById('cbSubmit');
  var fSubmitBtn = document.getElementById('fSubmit');
  if (cbSubmitBtn) {
    turnstileChangeHandlers['chat-callback'] = function () {
      cbSubmitBtn.disabled = !turnstileTokens['chat-callback'];
    };
  }
  if (fSubmitBtn) {
    turnstileChangeHandlers['chat-form'] = function () {
      fSubmitBtn.disabled = !turnstileTokens['chat-form'];
    };
  }

  function render() {
    var s = state;
    var rs = s.revealStep;
    var isCallbackPath = s.method === 'callback';
    var isFormPath = s.method === 'form';

    var showGreeting = rs !== null;
    var isTopicStep = rs === 'topic' && s.topic === null;
    var showTopicAnswer = s.topic !== null;
    var isMethodStep = rs === 'method' && s.method === null;
    var showMethodQuestion = rs !== null && rs !== 'topic';
    var showMethodAnswer = s.method !== null;
    var showCallbackBlock = isCallbackPath && (rs === 'callbackTime' || rs === 'callbackForm' || rs === 'doneCallback');
    var showFormBlock = isFormPath && (rs === 'form' || rs === 'doneForm');
    var isCallbackTimeStep = rs === 'callbackTime' && s.callbackTime === null;
    var isCallbackFormStep = rs === 'callbackForm' && !s.callbackSubmitted;
    var isDoneCallback = rs === 'doneCallback';
    var showTimeAnswer = s.callbackTime !== null;
    var isFormFieldsStep = rs === 'form' && !s.formSubmitted;
    var isDoneForm = rs === 'doneForm';

    show(els.greeting, showGreeting);

    show(els.topicAnswer, showTopicAnswer);
    if (showTopicAnswer) setText('topicLabel', TOPIC_LABELS[s.topic]);
    show(els.topicOptions, isTopicStep);

    show(els.methodQuestion, showMethodQuestion);
    if (showMethodQuestion) setText('topicLabelInline', TOPIC_LABELS[s.topic] || '');

    show(els.methodAnswer, showMethodAnswer);
    if (showMethodAnswer) setText('methodLabel', METHOD_LABELS[s.method]);
    show(els.methodOptions, isMethodStep);

    show(els.callbackBlock, showCallbackBlock);
    show(els.timeAnswer, showTimeAnswer);
    if (showTimeAnswer) setText('timeLabel', TIME_LABELS[s.callbackTime]);
    show(els.timeOptions, isCallbackTimeStep);
    show(els.callbackForm, isCallbackFormStep);
    show(els.callbackDone, isDoneCallback);
    if (isDoneCallback) {
      setText('callbackDonePhone', s.phone);
      setText('callbackDoneName', s.name);
      setText('callbackDoneTime', TIME_LABELS[s.callbackTime]);
    }

    show(els.formBlock, showFormBlock);
    show(els.formFields, isFormFieldsStep);
    show(els.formDone, isDoneForm);
    if (isDoneForm) {
      setText('formDoneMessage', s.message);
      setText('formDoneName', s.name);
    }

    show(els.typing, s.typing);

    checkScroll();
  }

  function checkScroll() {
    var canScroll = thread.scrollHeight - thread.clientHeight - thread.scrollTop > 8;
    if (canScroll !== state.canScrollMore) {
      state.canScrollMore = canScroll;
    }
    show(scrollHint, state.canScrollMore);
  }

  thread.addEventListener('scroll', checkScroll);

  var stepTimer = null;
  function advance(nextStep, extra) {
    Object.assign(state, extra, { typing: true });
    render();
    clearTimeout(stepTimer);
    stepTimer = setTimeout(function () {
      state.revealStep = nextStep;
      state.typing = false;
      render();
    }, TYPING_MS_STEP);
  }

  /* Initial delayed greeting, simulating a live typing assistant */
  setTimeout(function () {
    state.typing = true;
    render();
    setTimeout(function () {
      state.typing = false;
      state.revealStep = 'topic';
      render();
    }, TYPING_MS_FIRST);
  }, INITIAL_DELAY_MS);

  /* Topic selection */
  thread.querySelectorAll('[data-topic]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      advance('method', { topic: btn.getAttribute('data-topic') });
    });
  });

  /* Method selection (call = real tel: link, no state change needed) */
  thread.querySelectorAll('[data-method]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var method = btn.getAttribute('data-method');
      if (method === 'callback') {
        advance('callbackTime', { method: 'callback' });
      } else if (method === 'form') {
        advance('form', { method: 'form' });
      }
    });
  });

  /* Callback time selection */
  thread.querySelectorAll('[data-time]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      advance('callbackForm', { callbackTime: btn.getAttribute('data-time') });
    });
  });

  /* Edit / go-back links */
  thread.querySelectorAll('[data-action]').forEach(function (btn) {
    var action = btn.getAttribute('data-action');

    if (action === 'editTopic') {
      btn.addEventListener('click', function () {
        Object.assign(state, {
          revealStep: 'topic', typing: false,
          topic: null, method: null, callbackTime: null,
          formSubmitted: false, callbackSubmitted: false,
        });
        render();
      });
    }

    if (action === 'editMethod') {
      btn.addEventListener('click', function () {
        Object.assign(state, {
          revealStep: 'method', typing: false,
          method: null, callbackTime: null,
          formSubmitted: false, callbackSubmitted: false,
        });
        render();
      });
    }

    if (action === 'editTime') {
      btn.addEventListener('click', function () {
        Object.assign(state, {
          revealStep: 'callbackTime', typing: false,
          callbackTime: null, callbackSubmitted: false,
        });
        render();
      });
    }

    if (action === 'submitCallback') {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var nameEl = document.getElementById('cbName');
        var phoneEl = document.getElementById('cbPhone');
        var name = (nameEl && nameEl.value.trim()) || '';
        var phone = (phoneEl && phoneEl.value.trim()) || '';
        var errorEl = $('callbackError');
        if (errorEl) errorEl.hidden = true;
        btn.disabled = true;

        submitToFormspark({
          name: name || 'Unbekannt',
          phone: phone,
          callbackTime: TIME_LABELS[state.callbackTime] || '',
        }, 'Lina Chat – Rückruf', 'chat-callback').then(function () {
          state.name = name || 'Ihnen';
          state.phone = phone;
          advance('doneCallback', { callbackSubmitted: true });
        }).catch(function () {
          resetTurnstile('chat-callback');
          btn.disabled = true; // stays disabled until the widget clears again
          if (errorEl) errorEl.hidden = false;
        });
      });
    }

    if (action === 'submitForm') {
      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        var nameEl = document.getElementById('fName');
        var phoneEl = document.getElementById('fPhone');
        var emailEl = document.getElementById('fEmail');
        var messageEl = document.getElementById('fMessage');
        var name = (nameEl && nameEl.value.trim()) || '';
        var message = (messageEl && messageEl.value.trim()) || '';
        var errorEl = $('formError');
        if (errorEl) errorEl.hidden = true;
        btn.disabled = true;

        submitToFormspark({
          name: name || 'Unbekannt',
          phone: (phoneEl && phoneEl.value.trim()) || '',
          email: (emailEl && emailEl.value.trim()) || '',
          message: message,
        }, 'Lina Chat – Formular', 'chat-form').then(function () {
          state.name = name || 'Ihnen';
          state.message = message;
          advance('doneForm', { formSubmitted: true });
        }).catch(function () {
          resetTurnstile('chat-form');
          btn.disabled = true; // stays disabled until the widget clears again
          if (errorEl) errorEl.hidden = false;
        });
      });
    }
  });

  render();
  }

  /* ---------- Leistungen accordion (mobile only — always expanded on desktop) ---------- */

  var isDesktop = window.matchMedia('(min-width: 1024px)');

  if (isDesktop.matches) {
    document.querySelectorAll('[data-accordion]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'true');
    });
  }

  document.querySelectorAll('[data-accordion]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (isDesktop.matches) return;
      var key = btn.getAttribute('data-accordion');
      var panel = document.querySelector('[data-accordion-panel="' + key + '"]');
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (panel) panel.hidden = isOpen;
    });
  });

  /* ---------- FAQ accordion ---------- */

  document.querySelectorAll('[data-faq]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-faq');
      var panel = document.querySelector('[data-faq-panel="' + key + '"]');
      var isOpen = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (panel) panel.hidden = isOpen;
    });
  });

  /* ---------- Kontakt form ---------- */

  var kName = document.getElementById('kName');
  var kEmail = document.getElementById('kEmail');
  var kConsent = document.getElementById('kConsent');
  var kontaktSubmit = document.getElementById('kontaktSubmit');

  if (kName && kEmail && kConsent && kontaktSubmit) {
    var kPhone = document.getElementById('kPhone');
    var kSubject = document.getElementById('kSubject');
    var kMessage = document.getElementById('kMessage');
    var kontaktError = document.querySelector('[data-el="kontaktError"]');
    var kontaktSubmitLabel = kontaktSubmit.textContent;

    function updateKontaktSubmit() {
      kontaktSubmit.disabled = !(kName.value.trim() && kEmail.value.trim() && kConsent.checked && turnstileTokens.kontakt);
    }
    turnstileChangeHandlers.kontakt = updateKontaktSubmit;
    [kName, kEmail].forEach(function (el) { el.addEventListener('input', updateKontaktSubmit); });
    kConsent.addEventListener('change', updateKontaktSubmit);
    updateKontaktSubmit();

    kontaktSubmit.addEventListener('click', function () {
      if (kontaktSubmit.disabled) return;
      kontaktSubmit.disabled = true;
      kontaktSubmit.textContent = 'Wird gesendet …';
      if (kontaktError) kontaktError.hidden = true;

      submitToFormspark({
        name: kName.value.trim(),
        phone: kPhone ? kPhone.value.trim() : '',
        email: kEmail.value.trim(),
        subject: kSubject ? kSubject.value : '',
        message: kMessage ? kMessage.value.trim() : '',
      }, 'Kontaktformular', 'kontakt').then(function () {
        var formEl = document.querySelector('[data-el="kontaktForm"]');
        var doneEl = document.querySelector('[data-el="kontaktDone"]');
        var nameSpan = document.querySelector('[data-text="kontaktDoneName"]');
        if (nameSpan) nameSpan.textContent = kName.value.trim();
        if (formEl) formEl.hidden = true;
        if (doneEl) doneEl.hidden = false;
      }).catch(function () {
        kontaktSubmit.textContent = kontaktSubmitLabel;
        resetTurnstile('kontakt');
        updateKontaktSubmit();
        if (kontaktError) kontaktError.hidden = false;
      });
    });
  }

  /* ---------- Bewerbungsformular (jobs.html) ---------- */

  var jFirstname = document.getElementById('jFirstname');
  var jEmail = document.getElementById('jEmail');
  var jConsent = document.getElementById('jConsent');
  var jobApplySubmit = document.getElementById('jobApplySubmit');

  if (jFirstname && jEmail && jConsent && jobApplySubmit) {
    var jLastname = document.getElementById('jLastname');
    var jPhone = document.getElementById('jPhone');
    var jPosition = document.getElementById('jPosition');
    var jMessage = document.getElementById('jMessage');
    var jResume = document.getElementById('jResume');
    var jResumeLabel = document.getElementById('jResumeLabel');
    var jResumeLabelText = document.getElementById('jResumeLabelText');
    var resumeError = document.querySelector('[data-el="resumeError"]');
    var applyError = document.querySelector('[data-el="applyError"]');
    var applySubmitLabel = jobApplySubmit.textContent;
    var RESUME_LABEL_DEFAULT = jResumeLabelText ? jResumeLabelText.textContent : '';
    var RESUME_MAX_BYTES = 10 * 1024 * 1024;

    if (jResume) {
      jResume.addEventListener('change', function () {
        var file = jResume.files && jResume.files[0];
        if (!file) {
          if (jResumeLabelText) jResumeLabelText.textContent = RESUME_LABEL_DEFAULT;
          if (jResumeLabel) jResumeLabel.classList.remove('has-file');
          if (resumeError) resumeError.hidden = true;
          return;
        }
        if (file.size > RESUME_MAX_BYTES) {
          jResume.value = '';
          if (jResumeLabelText) jResumeLabelText.textContent = RESUME_LABEL_DEFAULT;
          if (jResumeLabel) jResumeLabel.classList.remove('has-file');
          if (resumeError) resumeError.hidden = false;
          return;
        }
        if (resumeError) resumeError.hidden = true;
        if (jResumeLabelText) jResumeLabelText.textContent = file.name;
        if (jResumeLabel) jResumeLabel.classList.add('has-file');
      });
    }

    function updateApplySubmit() {
      jobApplySubmit.disabled = !(jFirstname.value.trim() && jEmail.value.trim() && jConsent.checked && turnstileTokens.apply);
    }
    turnstileChangeHandlers.apply = updateApplySubmit;
    [jFirstname, jEmail].forEach(function (el) { el.addEventListener('input', updateApplySubmit); });
    jConsent.addEventListener('change', updateApplySubmit);
    updateApplySubmit();

    jobApplySubmit.addEventListener('click', function () {
      if (jobApplySubmit.disabled) return;
      jobApplySubmit.disabled = true;
      jobApplySubmit.textContent = 'Wird gesendet …';
      if (applyError) applyError.hidden = true;

      var formData = new FormData();
      formData.append('firstName', jFirstname.value.trim());
      formData.append('lastName', jLastname ? jLastname.value.trim() : '');
      formData.append('email', jEmail.value.trim());
      formData.append('phone', jPhone ? jPhone.value.trim() : '');
      formData.append('position', jPosition ? jPosition.value : '');
      formData.append('message', jMessage ? jMessage.value.trim() : '');
      if (jResume && jResume.files && jResume.files[0]) {
        formData.append('resume', jResume.files[0], jResume.files[0].name);
      }

      submitFormDataToFormspark(formData, 'Bewerbungsformular', 'apply').then(function () {
        var formEl = document.querySelector('[data-el="applyForm"]');
        var doneEl = document.querySelector('[data-el="applyDone"]');
        var nameSpan = document.querySelector('[data-text="applyDoneName"]');
        if (nameSpan) nameSpan.textContent = jFirstname.value.trim();
        if (formEl) formEl.hidden = true;
        if (doneEl) doneEl.hidden = false;
      }).catch(function () {
        jobApplySubmit.textContent = applySubmitLabel;
        resetTurnstile('apply');
        updateApplySubmit();
        if (applyError) applyError.hidden = false;
      });
    });
  }
})();
