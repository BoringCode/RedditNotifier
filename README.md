# [RedditNotifer](https://addons.mozilla.org/en-US/firefox/addon/redditnotifier/) (v2.0.3) <img src="https://raw.githubusercontent.com/BoringCode/RedditNotifier/master/data/icon-logo.png" alt="Icon" align="right" height="48"/>

A simple addon for Firefox that alerts you to new unread messages on [reddit](http://reddit.com/).

This addon is written with the Firefox [Addon SDK](https://wiki.mozilla.org/Labs/Jetpack).

##Features

- Toolbar button to allow easy access to your reddit inbox.
- Notifications (can be turned off) when you have new messages or moderator mail.
- Watch your favorite subreddit for new posts.
- Plays a sound when there are new messages (can be turned off).
- A persistent bubble on the toolbar button that tells you exactly how many messages you have.
- Panel to quickly view and open unread messages and subreddits.
- Restartless; just install and you're ready to go!
- Doesn't store login credentials. Just log into reddit like you normally would.
- Customizable refresh time (10 seconds to infinity).

## Development

Install jpm (jetpack manager) using npm

```
npm install jpm -g
```

Test RedditNotifier with a blank Firefox profile (unread messages requires a reddit account)

```
jpm run
```

Export XPI (for distribution)

```
jpm xpi
```

## How can I help?

- [Report issues](https://github.com/BoringCode/RedditNotifier/issues).
- Help with active development. [Submit a pull request](https://github.com/BoringCode/RedditNotifier/pulls).
- [Join us on reddit!](http://reddit.com/r/redditnotifier)

### License
Licensed under the [Mozilla Public License version 2.0](https://www.mozilla.org/MPL/2.0/)

A project by [Bradley Rosenfeld](https://bradleyrosenfeld.com)
