# BlueBookmark

<img src="bluebookmark.png" width="128">

Bookmark feed for Bluesky, a serverless application running on Cloudflare Workers®︎, using [hono](https://github.com/honojs/hono) and written in simple code.

## Features
- Private bookmarks hidden from other users
- Fast response time, performed at the cloud edge
- Secure design with no credentials stored

## Usage

### For iOS device

1. Get a token from the top page
2. Install iOS shortcut
  - e.g. https://www.icloud.com/shortcuts/2a02de3a3a0e41d29e88bf461eb8daa3
3. Bookmark Bluesky post from share menu
4. Refresh bookmark feed

## Limitation
- Android is not yet supported.
- Restricted to only be available to the feed creator and mutual follows (because it is running on a Free Cloudflare Workers plan).
- A limit on how many bookmarks can be added per person, and once the limit is reached, no more bookmarks can be added.

## API

### *POST* `/api/register`

|  field  |   name   |  type  |
|:-------:|:--------:|:------:|
|  form   |  handle  | string |
|  form   | password | string |

Enter the Handle Name and App Password to get a token to add a bookmark.

> [!CAUTION]
> Please manage your tokens carefully. If it is leaked, bookmarks will be added or deleted freely ( viewing is not allowed with this token).

### *POST* `/api/bookmark`

|  field  |      name     |     type     |
|:-------:|:-------------:|:------------:|
| header  | Authorization | Bearer token |
|  form   |      url      |     URL      |


Add a bookmark. On success, a JSON response is returned with a status code of 201.

### *DELETE* `/api/bookmark`

|  field  |      name     |     type     |
|:-------:|:-------------:|:------------:|
| header  | Authorization | Bearer token |
|  form   |      url      |     URL      |

Delete a bookmark. On success, a JSON response is returned with a status code of 200.

## License

Licensed unser [MIT](LICENSE)
