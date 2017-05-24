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
		"https://www.reddit.com/message/unread.json": {
			"type": "unreadMessage",
			"message": "%d new message(s)",
			"format": {
				data: { children: "count" }
			},
			"unread": 0,
			"lastChecked": -1,
			"notified": false
		},
		"https://www.reddit.com/message/moderator/unread.json": {
			"type": "unreadModerator",
			"message": "%d new moderator mail message(s)",
			"format": {
				data: { children: "count" }
			},
			"unread": 0,
			"lastChecked": -1,
			"notified": false
		},
		"https://www.reddit.com/r/TagPro/new.json": {
			"type": "newPost",
			"message": "There are new posts in: /r/TagPro",
			"format": {
				data: { children: [{data: "created_utc" }] }
			},
			"unread": 0,
			"lastChecked": -1,
			"notified": false,
			"forceNotify": true
		}
	},
	ignore: [],
	messages: {
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
	var self = this;

	self.timer = null;

	// Load URLs
	self.urls = config.unreadURLS;

	self.notifier = new Notify(config.name, config.notifyTimeout);

	var notify = function() {
		var url, data, totalUnread = 0, messages = [], urls = self.urls;

		// Create notification message
		for (url in urls) {
			data = urls[url];
			if (data["unread"] > 0 && data["notified"] === false) {
				messages.push(sprintf(data["message"], data["unread"]));
				data["notified"] = true;
				totalUnread += data["unread"];
			}
		}

		// Set button state, badge, and tooltip
		updateButton("default", totalUnread, messages);

		// Display notification
		if (messages.length > 0) {
			// Generate notification
			self.notifier.create(config.icons["unread"]["64"], "New Messages", messages.join("\n"), function(id) {
				if (messages.length === 1) {
					log("Go directly to GO");
				} else {
					log("Open panel");
				}
			});		
		}
	}

	var updateButton = function(state = "default", unread = 0, tooltip = config.name) {
		var button = browser.browserAction;
		// Empty string clears badge
		button.setBadgeText({
			"text": (unread == 0) ? "" : unread.toString()
		});		
		// Automatically set state to unread if unread count is greater than 0
		if (unread > 0) state = "unread";
		// Set icon based upon state
		button.setIcon({
			"path": (state in config.icons) ? config.icons[state] : config.icons["default"]
		});
		// Join tooltip array with line breaks
		if (typeof(tooltip) === "object") tooltip = tooltip.join("\n");
		if (tooltip.length === 0) tooltip = config.name;
		button.setTitle({
			"title": tooltip
		});
	}

	var unread = function(results = []) {
		var i, result, url, response, unread;
		// Loop through each request object
		for (i = 0; i < results.length; i++) {
			result = results[i];
			log("Parsing " + result["url"]);

			// Sanity check
			if (!(result["url"] in self.urls)) continue;
			url = self.urls[result["url"]];
			
			unread = countUnread(result["response"], url["format"], url["lastChecked"]);
			// Set flag if user should be notified
			if (unread > url["unread"] || ("forceNotify" in url && url["forceNotify"] === true)) {
				url["notified"] = false;
			}
			url["unread"] = unread;

			// Set timestamp to time of last request
			url["lastChecked"] = result["requested"];
		}
		notify();
	}

	// Recursively count items in an object based on a search format
	var countUnread = function(data, format, time) {
		// Base case
		if (typeof(format) === "string") {
			var count;
			switch(format) {
				case "count":
					// Return the length of the array
					count = (typeof(data) === "object") ? data.length : 0;
					break;
				case "created_utc": 
					// Return 1 if timestamp is greater than the last checked time
					count = (format in data && data[format] >= time) ? 1 : 0;
					break;
				default:
					count = 0;
			}
			return count;
		} else {
			// Sanity check
			if (typeof(data) !== "object") return 0;
			// Recursively find key I'm looking for
			// Format should only have one key
			for (var key in format) {
				// Can't find key in data, return count of 0
				if (!(key in data)) return 0;
				return countUnread(data[key], format[key], time);
			}
		}
	}

	var update = function() {
		var requests = [];
		var url, obj;
		// Set button to indicate refresh
		updateButton("reload");
		for (url in self.urls) {
			// User can disable checking this endpoint in settings
			if ("disabled" in self.urls[url] && self.urls[url]["disabled"] === true) continue;
			requests.push(Request("GET", url))
		}
		Promise.all(requests).then(function(results) {
			unread(results);
		}).catch(function(error) {
			log(error);
			updateButton("default");
		})
	}

	var init = function() {
		log("Starting RedditNotifier");
		update();
		//self.timer = setTimeout(update.bind(self), config.refreshTime * 1000);
	}


	return {
		init: init
	}
}

var main = new RedditNotifier();
main.init();