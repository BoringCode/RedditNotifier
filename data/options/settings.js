var settings = [
		{
			"name": "showNotifications",
			"title": "Display notifications?",
			"description": "Should notifications be shown every time you get new messages?",
			"type": "bool",
			"value": true
		},
		{
			"name": "playAlert",
			"title": "Notification sound?",
			"description": "Play a sound when there is a new notification?",
			"type": "bool",
			"value": true
		},
		{
			"name": "volume",
			"title": "Volume",
			"description": "Set the volume of the notification sound from 0 to 100, with 100 being the loudest.",
			"type": "integer",
			"value": 80
		},
		{
			"name": "timing",
			"title": "Check Reddit for new messages every (seconds):",
			"description": "Minimum time is 10 seconds",
			"type": "integer",
			"value": 30
		},
		{
			"name": "subreddits",
			"title": "Check for new posts in the following subreddits:",
			"description": "Comma separated list of subreddit names (e.g. gifs, TagPro). Do not include /r/",
			"type": "string"
		},
		{
			"name": "unreadModerator",
			"title": "Check for new moderator mail?",
			"type": "bool",
			"value": true
		},
		{
			"name": "unreadMessage",
			"title": "Check for unread messages and replies?",
			"type": "bool",
			"value": true
		}
];