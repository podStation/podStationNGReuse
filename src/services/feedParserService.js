(function() {
	'use strict';

	angular
		.module('podStationReusables')
		.factory('feedParserService', feedParserService);

	function feedParserService() {
		var service = {
			parseRSSFeed: parsePodcastFeed
		};

		return service;
	}
})();

// We keep it in the global scope because it is still
// needed for the chrome extension.
function parsePodcastFeed(feedContent) {

	var result;
	var jQParsedContent = typeof feedContent === "string" ? $.parseXML(feedContent) : feedContent;
	var xml = $(jQParsedContent);

	if(!xml.find('rss > channel')[0]) {
		return result;
	}

	result = {};
	result.podcast = {};
	result.episodes = [];

	result.podcast.title = xml.find('rss > channel > title').text();
	result.podcast.description = processMultiTagText(xml.find('rss > channel > description'));
	result.podcast.link = xml.find('rss > channel > link').text();

	result.podcast.pubDate = 
	  postProcessPubDate(xml.find('rss > channel > pubDate').text()) ||
	  postProcessPubDate(xml.find('rss > channel > lastBuildDate').text());

	result.podcast.image = 
	  $(xml.find('rss > channel > image > url')[0]).text() ||
	  xml.find('rss > channel > image').attr('href') ||
	  xml.find('rss > channel > itunes\\:image').attr('href');

	xml.find('rss > channel > item').each(function() {
		var feedItem = $(this);
		var episode = {};
		var enclosure;

		// the selector will find 'title' for all namespaces, we may find more
		// than one. They are in theory all the same, so we take the first.
		episode.title = $(feedItem.find('title')[0]).text();
		episode.link = feedItem.find('link').text();
		episode.pubDate = postProcessPubDate(feedItem.find('pubDate').text());
		episode.parsedPubDate = new Date(episode.pubDate);
		episode.description = feedItem.find('description').text();
		episode.guid = feedItem.find('guid').text();
		enclosure = feedItem.find('enclosure');
		episode.enclosure = {
			url: enclosure.attr('url'),
			length: enclosure.attr('length'),
			type: enclosure.attr('type')
		};

		result.episodes.push(episode);
	});

	result.episodes.sort(function(a, b) {
		return b.parsedPubDate - a.parsedPubDate;
	});

	// if the podcast pubdate is missing or older then the most recent episode, 
	// we want to show the pubdate of the most recent e espisode
	if(result.episodes[0] && result.episodes[0].pubDate  &&
		(
			result.podcast.pubDate === undefined || result.podcast.pubDate === '' ||
			(new Date(result.episodes[0].pubDate)) > (new Date(result.podcast.pubDate))
		)
	) {
		result.podcast.pubDate = result.episodes[0].pubDate;
	}

	return result;

	function postProcessPubDate(pubDate) {
		return pubDate.replace('GTM', 'GMT');
	}

	function processMultiTagText(selectedTags) {
		var text = '';
		var texts = [];

		selectedTags.each(function() {
			var selectedTag = $(this);
			if(texts.indexOf(selectedTag.text()) < 0) {
				if(text) {
					text += '<br>';
				}

				text += selectedTag.text();

				texts.push(selectedTag.text());
			}
		});

		return text;
	}
}