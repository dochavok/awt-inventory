// AC-4: the terms of use, in plain language, accepted at sign-up.

export function Terms() {
  return (
    <section className="card terms" aria-labelledby="terms-title">
      <h2 id="terms-title">Terms of use</h2>
      <ul>
        <li>Accounts are for ages 13 and up.</li>
        <li>
          This app is your own record, not an official one. The DMs and the game&apos;s rules decide what a character
          has.
        </li>
        <li>
          Trades are arranged and carried out between players, outside the app. The app only shows what&apos;s listed.
        </li>
        <li>
          No offensive display names or listing text, and no listings for things you don&apos;t have. The maintainer may
          remove content or accounts that break this.
        </li>
        <li>
          The app is provided as is. It may change or shut down, and data could be lost, so keep your own export of your
          records.
        </li>
        <li>Deleting your account is permanent: everything in it is removed and can&apos;t be brought back.</li>
      </ul>
    </section>
  );
}
