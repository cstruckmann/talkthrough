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

  const audio = /** @type {HTMLAudioElement} */ (document.getElementById('audio'));
  const playButton = /** @type {HTMLButtonElement} */ (document.getElementById('play'));
  const previousButton = /** @type {HTMLButtonElement} */ (document.getElementById('previous'));
  const nextButton = /** @type {HTMLButtonElement} */ (document.getElementById('next'));
  const rateSelect = /** @type {HTMLSelectElement} */ (document.getElementById('rate'));
  const position = /** @type {HTMLElement} */ (document.getElementById('position'));
  const fileLabel = /** @type {HTMLElement} */ (document.getElementById('file'));
  const kindLabel = /** @type {HTMLElement} */ (document.getElementById('kind'));
  const narration = /** @type {HTMLElement} */ (document.getElementById('narration'));
  const status = /** @type {HTMLElement} */ (document.getElementById('status'));
  const empty = /** @type {HTMLElement} */ (document.getElementById('empty'));
  const player = /** @type {HTMLElement} */ (document.getElementById('player'));

  /** Index of the segment currently loaded, so a late `ended` can be ignored. */
  let currentIndex = -1;
  /** Autoplay is only permitted once the user has pressed play themselves. */
  let userHasPlayed = false;

  const post = (message) => vscode.postMessage(message);

  function setPlayingUi(playing) {
    playButton.textContent = playing ? '⏸' : '▶';
    playButton.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playButton.classList.toggle('is-playing', playing);
  }

  function showEmpty(show) {
    empty.hidden = !show;
    player.hidden = show;
  }

  audio.addEventListener('play', () => setPlayingUi(true));
  audio.addEventListener('pause', () => setPlayingUi(false));

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

  previousButton.addEventListener('click', () => post({ type: 'previous' }));
  nextButton.addEventListener('click', () => post({ type: 'next' }));

  rateSelect.addEventListener('change', () => {
    const rate = Number(rateSelect.value);
    audio.playbackRate = rate;
    post({ type: 'rate', rate });
  });

  document.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLSelectElement) {
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
        showEmpty(false);
        currentIndex = message.index;
        status.textContent = '';

        position.textContent = `${message.index + 1} / ${message.total}`;
        fileLabel.textContent = message.file;
        kindLabel.textContent = message.kind;
        kindLabel.dataset.kind = message.kind;
        narration.textContent = message.narration;
        document.title = message.title;

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
        setPlayingUi(false);
        showEmpty(true);
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
