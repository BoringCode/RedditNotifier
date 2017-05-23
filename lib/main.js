/*
 * RedditNotifier
 * Displays messages and unread counts for reddit
 * version 3.0.0
 */

"use strict";

var config = {
	debug: true,
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
	// Seconds to display notification
	notifyTimeout: 5,
	icons: {
		default: {
			"16": "data/icon/default/icon-16.png",
			"32": "data/icon/default/icon-32.png",
			"64": "data/icon/default/icon-64.png",
		},
		reload: {
			"16": "data/icon/reload/icon-16.png",
			"32": "data/icon/reload/icon-32.png",
			"64": "data/icon/reload/icon-64.png",
		},
		unread: {
			"16": "data/icon/unread/icon-16.png",
			"32": "data/icon/unread/icon-32.png",
			"64": "data/icon/unread/icon-64.png",
		},
		logo: "icon-logo.png"
	},
	alert: "alert.wav",
	volume: 100,
};

var RedditNotifier = function() {
	var timer = null;
	var unread = {};
	var notifier = new Notify(config.name, config.notifyTimeout);

	var update = function() {

	}

	var init = function() {
		log("Starting RedditNotifier");
		notifier.create(config["icons"]["unread"]["64"], "New!", "Messages!");
	}


	return {
		init: init
	}
}

var main = RedditNotifier();
main.init();