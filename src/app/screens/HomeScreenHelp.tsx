// NF-2: on iPhone, how to add the app to the home screen, and why it matters.
// Safari has no install prompt, so the steps are shown until the app is opened
// from the home screen.

function onIphoneInSafari(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return ios && !standalone;
}

export function HomeScreenHelp() {
  if (!onIphoneInSafari()) return null;
  return (
    <section className="card note" aria-labelledby="home-screen-title">
      <h2 id="home-screen-title">Add to Home Screen</h2>
      <p>
        In Safari, tap <strong>Share</strong> (the square with an arrow), then <strong>Add to Home Screen</strong>. The
        app then opens full screen from its own icon.
      </p>
      <p>
        <strong>Why it matters:</strong> Safari can clear a website&apos;s stored data after about 7 days without a
        visit. Once the app is on your home screen, your records stay on your phone.
      </p>
    </section>
  );
}
