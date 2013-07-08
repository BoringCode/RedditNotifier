//Reddit Notifier - v0.1

//Get dependencies
var data = require('self').data;
var prefs = require("sdk/simple-prefs");
var widget = require("sdk/widget");
var request = require("sdk/request");
var notifications = require("sdk/notifications");
var button = require("toolbarbutton");

var main = {
	//settings
	name: "RedditNotifier",
	unreadURL: "http://www.reddit.com/message/unread.json",
	icon: data.url("reddit-notifier-icon.png"),
	iconSmall: data.url("reddit-notifier-icon-small.png"),
	iconSmallUnread: data.url("reddit-notifier-icon-small-unread.png"),
	buttonJS: data.url('button.js'),

	addonButton: null,

	init: function() {
		//do stuff on load of the addon
		main.onLoad(require('self').loadReason);

		console.log(main.requestUnread());
	},
	onLoad: function(loadReason) {
		console.log(loadReason);
		console.log(main.iconSmall);
		//create button for refreshing/opening inbox
		main.addonButton = button.ToolbarButton({
			id: main.name + "-button",
		  	label: main.name,
		 	image: main.iconSmall,
		  	onCommand: function () {
				console.log("Clicked");
		  	}
		});

		if (loadReason === "install" || loadReason == "startup") {
			main.addonButton.moveTo({
				toolbarID: "nav-bar",
			    forceMove: false // only move from palette
			});
		}
	},
	requestUnread: function() {
		request.Request({
			url: main.unreadURL,
			onComplete: function (response) {
				if ("data" in response) {
					var data = response["data"]["children"];
					console.log(data.length);
				} else {
					console.log("Looks like you are logged out");
				}
			}
		}).get();
		return 1;
	}
}

exports.main = main.init;