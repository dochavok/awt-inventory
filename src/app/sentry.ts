// The only parts of the Sentry SDK the app uses (NF-12). Loaded on its own by
// error-service.ts; importing just these lets the build leave out the rest.
export { captureException, init } from "@sentry/browser";
