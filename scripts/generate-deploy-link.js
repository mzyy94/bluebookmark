const PROJECT_URL = 'https://github.com/mzyy94/bluebookmark';
const ONE_CLICK_BASE_URL = 'https://deploy.workers.cloudflare.com';
const FIELDS = [
  {
    name: 'Your Bluesky Handle Name',
    secret: 'FEED_OWNER',
    descr: 'Handle name without "@"',
  },
  {
    name: 'Your Bluesky App Password',
    secret: 'APP_PASSWORD',
    descr: 'App Password using for publish Bookmark Feed to Bluesky serever',
  },
  {
    name: 'Feed hosted Domain',
    secret: 'FEED_HOST',
    descr: 'Domain on which your feed will be running',
  },
  {
    name: 'JWT secret',
    secret: 'JWT_SECRET',
    descr: 'Random strings to protect sessions (e.g. af3cdpifvdaih8hqg9)',
  },
];

const API_TOKEN_TEMPLATE = JSON.stringify([
  { key: 'd1', type: 'edit' },
  { key: 'page', type: 'edit' },
  { key: 'access', type: 'edit' },
  { key: 'workers_kv_storage', type: 'edit' },
  { key: 'access_acct', type: 'read' },
  { key: 'dns', type: 'edit' },
  { key: 'workers_scripts', type: 'edit' },
  { key: 'account_rulesets', type: 'edit' },
]);

const fields = FIELDS.map((x) => JSON.stringify(x))
  .map(encodeURIComponent)
  .map((v) => `fields=${v}`)
  .join('&');
const url = new URL(
  `/?url=${PROJECT_URL}&authed=true&${fields}&apiTokenTmpl=${API_TOKEN_TEMPLATE}&apiTokenName=BlueBookmark`,
  ONE_CLICK_BASE_URL,
);
console.log(url.href);
