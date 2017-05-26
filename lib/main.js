/*
 * RedditNotifier
 * Displays messages and unread counts for reddit
 * version 3.0.0
 */

"use strict";

var config = {
	debug: true,
	name: "RedditNotifier",
	popup: "data/panel/panel.html",
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
			"action": "https://www.reddit.com/message/unread/"
		},
		"https://www.reddit.com/message/moderator/unread.json": {
			"type": "unreadModerator",
			"message": "%d new moderator mail message(s)",
			"format": {
				data: { children: "count" }
			},
			"unread": 0,
			"lastChecked": -1,
			"action": "https://www.reddit.com/message/moderator/unread/"
		},
		"https://www.reddit.com/r/TagPro/new.json": {
			"type": "newPost",
			"message": "There are new posts in: /r/TagPro",
			"format": {
				data: { children: [{data: "created_utc" }] }
			},
			"unread": 0,
			"lastChecked": -1,
			"action": "http://www.reddit.com/r/TagPro/new/"
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

	self.messages = [];

	self.notifier = new Notify(config.name, config.notifyTimeout);

	var clickButton = function() {
		log("Clicked button");
		if (self.messages.length === 0) {
			openTab({ action: config.urls.reddit });
		} else {
			openTab(self.messages[0]);
		}
	};

	var updateButton = function(state = "default") {
		var button = browser.browserAction, unread, tooltip;

		unread = sum(self.urls, "unread");
		// Empty string clears badge
		button.setBadgeText({
			"text": (unread === 0) ? "" : unread.toString()
		});		

		// Automatically set state to unread if unread count is greater than 0
		if (state === "default" && unread > 0) state = "unread";
		// Set icon based upon state
		button.setIcon({
			"path": (state in config.icons) ? config.icons[state] : config.icons["default"]
		});

		// Join tooltip array with line breaks
		tooltip = (self.messages.length > 0) ? self.messages.join("\n") : config.name;
		button.setTitle({
			"title": tooltip
		});

		// Set popup if there is more than 1 message
		button.setPopup({
			popup: (self.messages.length > 1) ? config.popup : ""
		});
	}
 
	var openTab = function(action) {
		if (!("action" in action)) return;
		log(action.action);
		browser.tabs.create({
			url: action["action"]
		}).then(function() {
			log("Opened tab");
			// Reset unread count
			if ("id" in action && action["id"] in self.urls) {
				self.urls[action["id"]]["unread"] = 0;
				// Reset timestamp to now
				self.urls[action["id"]]["lastChecked"] = Date.now();
				// Remove from messages
				var index = self.messages.indexOf(action);
				if (index !== 1) {
					self.messages.splice(index, 1);
				}
			}
			updateButton();
		})
	}

	var unread = function(results = []) {
		var i, result, url, response, unread, message;
		var totalUnread = 0, notify = [];

		// Reset messages (we rebuild this array with the new results, slightly inefficient but meh)
		self.messages = [];

		// Loop through each request object
		for (i = 0; i < results.length; i++) {
			result = results[i];
			log("Parsing " + result["url"]);

			// Sanity check
			if (!(result["url"] in self.urls)) continue;
			url = self.urls[result["url"]];
			
			// Get total unread count for this response
			unread = countUnread(result["response"], url["format"], url["lastChecked"]);

			// Add new message to display in panel (or in notification)
			if (unread > 0) {
				// Display message in panel
				self.messages.push(new Message({
					"id": result["url"],
					"message": sprintf(url["message"], unread),
					"action": url["action"],
					"notify": (unread > url["unread"]),
				}));
			}

			url["unread"] = unread;
		}

		// Notify user of new messages
		notify = self.messages.filter(function(message) {
			notify = message.notify === true; message.notify = false; return notify; 
		});
		if (notify.length > 0) {
			self.notifier.create(config.icons["unread"]["64"], "New Messages", notify.join("\n"), function(id) {
				// I can't programmatically open the panel (fucking what)
				// so I'll open the first thing the user is notified about
				openTab(notify[0]);
			});	
		}
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
		log("Attempting update")
		// Set button to indicate refresh
		updateButton("reload");
		for (url in self.urls) {
			// User can disable checking this endpoint in settings
			if ("disabled" in self.urls[url] && self.urls[url]["disabled"] === true) continue;
			requests.push(Request("GET", url))
		}
		Promise.all(requests).then(function(results) {
			unread(results);
			updateButton();
			// Update according to user configuration (in seconds)
			self.timer = setTimeout(update.bind(self), config.refreshTime * 1000);
		}).catch(function(error) {
			log(error);
			updateButton();
			// Wait 3 minutes before firing again (avoid pinging reddit's servers too much)
			self.timer = setTimeout(update.bind(self), 180 * 1000);
		})
	}

	/*
	 * Handle extension messaging with various background scripts
	 */
	var onMessage = function(message, sender, sendResponse) {
		var response;
		if (!("type" in message)) {
			sendResponse(false); 
			return;
		}
		switch(message["type"]) {
			case "getMessages":
				response = self.messages;
				break;
			case "openTab":
				if ("action" in message) {
					var action = self.messages.find(function(msg) { return message["action"] === msg["action"] });
					if (typeof(action) !== "undefined") {
						openTab(action);
						response = true;
						break;
					}
				} 
			default:
				response = false;
		}
		if (response) sendResponse(response);
	};

	var init = function() {
		log("Starting RedditNotifier");

		// Set up listeners
		browser.browserAction.onClicked.addListener(clickButton.bind(self));
		browser.runtime.onMessage.addListener(onMessage.bind(self));

		// Fetch data from reddit
		update();
	}


	return {
		init: init
	}
}

var main = new RedditNotifier();
main.init();