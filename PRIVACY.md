> Draft — needs review and a hosted URL before Chrome Web Store submission.

# Privacy Policy — PageScorch

PageScorch is a Chrome extension that uses Google's Gemini API to generate a
humorous critique ("roast") of the webpage you're currently viewing.

## What data is collected and sent

When you click the extension's action button on a page, PageScorch reads that
page's title, URL, and up to 1,500 characters of its visible text content
(scripts, styles, nav/header/footer, ads, cookie banners, and popups/modals
are stripped out first). This data is sent directly from your browser to
Google's Gemini API (`generativelanguage.googleapis.com`) to generate the
roast text, using the API key you provide.

PageScorch only reads the page you actively click it on (`activeTab`
permission) — it does not run in the background on other tabs or sites.

No data is sent to any server operated by the developer of this extension.
The only outbound network request the extension makes is the one to Google's
Gemini API described above.

## What is stored locally

The extension stores the following in `chrome.storage.local` (on your own
device only):
- Your Gemini API key
- Your selected roast style
- Your selected Gemini model

None of this local storage is synced to a server, uploaded, or shared with
anyone. It stays on your machine and is only used to make the Gemini API
calls above.

## Analytics and tracking

PageScorch contains no analytics, telemetry, or tracking code. No usage data
is collected or transmitted to the developer.

## Third-party processing

Page content sent to Gemini is subject to Google's own privacy policy and
terms for the Gemini API. Review Google's terms if you have concerns about
how they process the text you submit.
