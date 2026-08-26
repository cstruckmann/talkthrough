// @ts-check
/**
 * Talkthrough player.
 *
 * Owns exactly one thing: the audio element. Position, editor choreography and
 * synthesis all belong to the host, so this reports what playback did and waits
 * to be told what to load next.
 */
(function () {
  const vscode = acquireVsCodeApi();

  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

  const audio = /** @type {HTMLAudioElement} */ ($('audio'));
  const playButton = /** @type {HTMLButtonElement} */ ($('play'));
  const rateSelect = /** @type {HTMLSelectElement} */ ($('rate'));
  const position = $('position');
  const time = $('time');
  const progress = $('progress');
  const progressFill = $('progressFill');
  const fileLabel = $('file');
  const kindLabel = $('kind');
  const narration = $('narration');
  const status = $('status');
  const empty = $('empty');
  const player = $('player');
  const errorState = $('errorState');

  /** Index of the segment currently loaded, so a late `ended` can be ignored. */
  let currentIndex = -1;
  let total = 0;
  /** Sentences of the current narration, for the highlight and click-to-seek. */
  let sentences = [];
  let highlighted = -1;
  /** Autoplay is only permitted once the user has pressed play themselves. */
  let userHasPlayed = false;

  const post = (message) => vscode.postMessage(message);

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '0:00';
    }
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }

  function setPlayingUi(playing) {
    playButton.textContent = playing ? '⏸' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }

  function show(which) {
    empty.hidden = which !== 'empty';
    player.hidden = which !== 'player';
    errorState.hidden = which !== 'error';
  }

  /** Fraction through the whole tour, counting progress within this segment. */
  function updateProgress() {
    if (total === 0 || currentIndex < 0) {
      progressFill.style.width = '0%';
      return;
    }
    const within =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.currentTime / audio.duration
        : 0;
    const fraction = Math.min(1, (currentIndex + within) / total);
    progressFill.style.width = `${(fraction * 100).toFixed(2)}%`;
    progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));

    time.textContent = Number.isFinite(audio.duration)
      ? `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`
      : '';
  }

  /**
   * Follows playback through the transcript.
   *
   * There are no word timings, so elapsed time is mapped onto characters and an
   * even speaking pace is assumed. It drifts inside a sentence but lands on the
   * right one, which is what the highlight needs.
   */
  function updateHighlight() {
    if (sentences.length === 0 || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    const totalChars = sentences[sentences.length - 1].end;
    const positionChars = (audio.currentTime / audio.duration) * totalChars;

    let index = sentences.length - 1;
    for (let i = 0; i < sentences.length; i++) {
      if (positionChars < sentences[i].end) {
        index = i;
        break;
      }
    }
    if (index === highlighted) {
      return;
    }
    highlighted = index;
    for (const node of narration.children) {
      node.classList.toggle('is-current', Number(node.getAttribute('data-index')) === index);
    }
  }

  function renderTranscript() {
    narration.textContent = '';
    highlighted = -1;

    sentences.forEach((sentence, index) => {
      const span = document.createElement('span');
      span.className = 'sentence';
      span.textContent = sentence.text;
      span.setAttribute('data-index', String(index));
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      span.title = 'Jump to this sentence';
      narration.append(span, document.createTextNode(' '));
    });
  }

  function seekToSentence(index) {
    const sentence = sentences[index];
    if (!sentence || !Number.isFinite(audio.duration) || audio.duration <= 0) {
      return;
    }
    const totalChars = sentences[sentences.length - 1].end;
    const fraction = totalChars === 0 ? 0 : sentence.start / totalChars;
    audio.currentTime = fraction * audio.duration;
    updateHighlight();
    updateProgress();
    post({ type: 'seek', fraction });
    if (audio.paused && userHasPlayed) {
      void audio.play().catch(() => setPlayingUi(false));
    }
  }

  narration.addEventListener('click', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.classList.contains('sentence')) {
      seekToSentence(Number(target.getAttribute('data-index')));
    }
  });

  narration.addEventListener('keydown', (event) => {
    const target = /** @type {HTMLElement} */ (event.target);
    if (target.classList.contains('sentence') && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      seekToSentence(Number(target.getAttribute('data-index')));
    }
  });

  audio.addEventListener('play', () => setPlayingUi(true));
  audio.addEventListener('pause', () => setPlayingUi(false));
  audio.addEventListener('timeupdate', () => {
    updateProgress();
    updateHighlight();
  });
  audio.addEventListener('loadedmetadata', updateProgress);

  audio.addEventListener('ended', () => {
    setPlayingUi(false);
    post({ type: 'ended', index: currentIndex });
  });

  audio.addEventListener('error', () => {
    if (audio.getAttribute('src')) {
      status.textContent = 'This segment could not be played.';
    }
  });

  playButton.addEventListener('click', () => {
    if (audio.paused) {
      userHasPlayed = true;
      void audio.play().catch(() => {
        status.textContent = 'Playback was blocked. Press play again.';
      });
      post({ type: 'play' });
    } else {
      audio.pause();
      post({ type: 'pause' });
    }
  });

  $('previous').addEventListener('click', () => post({ type: 'previous' }));
  $('next').addEventListener('click', () => post({ type: 'next' }));

  rateSelect.addEventListener('change', () => {
    const rate = Number(rateSelect.value);
    audio.playbackRate = rate;
    post({ type: 'rate', rate });
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    const onSentence =
      target instanceof HTMLElement && target.classList.contains('sentence');
    if (target instanceof HTMLSelectElement || onSentence) {
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      playButton.click();
    } else if (event.key === 'ArrowRight') {
      post({ type: 'next' });
    } else if (event.key === 'ArrowLeft') {
      post({ type: 'previous' });
    }
  });

  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'loadSegment': {
        show('player');
        currentIndex = message.index;
        total = message.total;
        sentences = message.sentences || [];
        status.textContent = '';

        position.textContent = `${message.index + 1} / ${message.total}`;
        fileLabel.textContent = message.file;
        kindLabel.textContent = message.kind;
        kindLabel.dataset.kind = message.kind;
        document.title = message.title;
        renderTranscript();

        if (message.audioSrc) {
          audio.src = message.audioSrc;
          audio.playbackRate = Number(rateSelect.value);
          // Autoplay is refused without a prior gesture, so the very first
          // segment always waits for the play button.
          if (message.autoplay && userHasPlayed) {
            void audio.play().catch(() => setPlayingUi(false));
          }
        } else {
          audio.removeAttribute('src');
          audio.load();
          setPlayingUi(false);
          status.textContent = 'Preparing narration…';
        }
        updateProgress();
        break;
      }

      case 'synthesisProgress': {
        if (message.ready < message.total) {
          status.textContent = `Preparing narration… ${message.ready} of ${message.total}`;
        } else if ((status.textContent || '').startsWith('Preparing')) {
          status.textContent = '';
        }
        break;
      }

      case 'tourFinished': {
        audio.pause();
        setPlayingUi(false);
        status.textContent = 'End of tour.';
        break;
      }

      case 'tourStopped': {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        currentIndex = -1;
        total = 0;
        sentences = [];
        narration.textContent = '';
        setPlayingUi(false);
        show('empty');
        break;
      }

      case 'showError': {
        audio.pause();
        audio.removeAttribute('src');
        $('errorTitle').textContent = message.title;
        $('errorDetail').textContent = message.detail;

        const actions = $('errorActions');
        actions.textContent = '';
        for (const action of message.actions || []) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = action.label;
          button.addEventListener('click', () =>
            post({ type: 'runCommand', command: action.command }),
          );
          actions.append(button);
        }
        show('error');
        break;
      }

      case 'error': {
        status.textContent = message.message;
        break;
      }
    }
  });

  post({ type: 'ready' });
})();
