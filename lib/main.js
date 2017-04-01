/*
 * RedditNotifier
 * Displays messages and unread counts for reddit
 * version 3.0.0
 */

"use strict";

var config = {
	name: "RedditNotifier",
	urls: {
		reddit: "https://www.reddit.com/",
		unreadMessage: "https://www.reddit.com/message/unread/",
		unreadModerator: "https://www.reddit.com/message/moderator/unread/",
		login: "https://ssl.reddit.com/login",
		install: "https://boringcode.github.io/RedditNotifier",
		newPosts: "https://www.reddit.com/r/%x%/new/",
		newPostsJSON: "https://www.reddit.com/r/%x%/new.json",
	},
	unreadURLS: {
		newPosts: {},
		unreadMessage: "https://www.reddit.com/message/unread.json",
		unreadModerator: "https://www.reddit.com/message/moderator/unread.json",
	},
	ignore: [],
	messages: {
		unreadMessage: "%x% new message(s)",
		unreadModerator: "%x% new moderator mail message(s)",
		newPosts: "There are new posts in: /r/%x%",
		loggedOut: "It looks like you are logged out of Reddit.\nTry logging in."
	},
	//multiplied by 1000 to get seconds, minus to 1000 to take into account delay when loading new data
	refreshTime: 30,
	forceShow: true,
	delayLoad: 5000,
	icons: {
		default: {
			"16": "icon/default/icon-16.png",
			"32": "icon/default/icon-32.png",
			"64": "icon/default/icon-64.png",
		},
		reload: {
			"16": "icon/reload/icon-16.png",
			"32": "icon/reload/icon-32.png",
			"64": "icon/reload/icon-64.png",
		},
		unread: {
			"16": "icon/unread/icon-16.png",
			"32": "icon/unread/icon-32.png",
			"64": "icon/unread/icon-64.png",
		},
		logo: "icon-logo.png"
	},
	alert: "alert.wav",
	volume: 100,
};
