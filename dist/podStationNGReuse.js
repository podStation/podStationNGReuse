angular.module('podStationReusables', []);
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

	processSocial(xml.find('rss > channel'), result.podcast);

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

		processSocial(feedItem, episode);

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

	function processSocial(xmlItem, result) {
		result.email = xmlItem.children('social\\:email').text();
		result.email = result.email || xmlItem.children('itunes\\:email').text();
		result.email = result.email || xmlItem.children('googleplay\\:email').text();

		xmlItem.children('social\\:handle').each(function() {
			const feedSocialHandle = $(this);
			const socialHandle = {};

			result.socialHandles = result.socialHandles || [];

			socialHandle.handle = feedSocialHandle.text();
			socialHandle.type = feedSocialHandle.attr('type');
			socialHandle.url = feedSocialHandle.attr('url');
			socialHandle.text = feedSocialHandle.attr('text');
			result.socialHandles.push(socialHandle);
		});

		xmlItem.children('social\\:crowdfunding').each(function() {
			const feedCrowdfunding = $(this);
			const crowdfunding = {};

			result.crowdfundings = result.crowdfundings || [];

			crowdfunding.handle = feedCrowdfunding.text();
			crowdfunding.type = feedCrowdfunding.attr('type');
			crowdfunding.url = feedCrowdfunding.attr('url');
			crowdfunding.text = feedCrowdfunding.attr('text');
			result.crowdfundings.push(crowdfunding);
		});

		xmlItem.children('social\\:participant').each(function() {
			const feedParticipant = $(this);
			const participant = {};

			result.participants = result.participants || [];

			participant.name = feedParticipant.attr('name');
			participant.id = feedParticipant.attr('id');
			participant.permanent = feedParticipant.attr('permanent');

			processSocial(feedParticipant, participant);

			result.participants.push(participant);
		});

		xmlItem.children('social\\:participantReference').each(function() {
			const feedParticipantReference = $(this);
			const participantReference = {};

			result.participantReferences = result.participantReferences || [];
			
			participantReference.id = feedParticipantReference.attr('id');

			result.participantReferences.push(participantReference);
		});
	}
}
(function() {
	'use strict';

	angular
		.module('podStationReusables')
		.factory('searchService', ['$http', '$q', searchService]);

	function searchService($http, $q) {
		var service = {
			search: search
		};

		var SearchResult = function() {
			this.title = '';
			this.feedUrl = '';
			this.description = '';
			this.link = '';
			this.itunesLink = '';
			this.image = '';

			this.merge = function(otherSearchResult) {
				if(otherSearchResult.description !== '')
					this.description = otherSearchResult.description;

				if(otherSearchResult.link !== '')
					this.link = otherSearchResult.link;

				if(otherSearchResult.image !== '')
					this.image = otherSearchResult.image;

				if(otherSearchResult.itunesLink !== '')
					this.itunesLink = otherSearchResult.itunesLink;
			}

			return this;
		}

		function mergeInResult(searchResult, searchResults) {
			var searchResultToMergeWith = searchResults.find(function(item) {
				return item.feedUrl === searchResult.feedUrl;
			});

			if(searchResultToMergeWith) {
				searchResultToMergeWith.merge(searchResult);
			}
			else {
				searchResults.push(searchResult);
			}
		}

		function search(searchTerms, callback) {
			var searchResults = [];

			var searchDigitalPodcastFinished = false;
			var searchiTunesFinished = false;

			// Search with digitalpodcast
			$http.get('http://api.digitalpodcast.com/v2r/search/', {
				params : {
					"appid": "0f56b00cfbdc051c29b88171e67507f3",
					"format": "rssopml",
					"keywords": searchTerms
				}
			}).then(function(response) {

				var xml = $($.parseXML(response.data));

				xml.find('opml > body > outline').each(function() {
					var feed = $(this);

					var searchResult = new SearchResult;

					searchResult.title = feed.attr('text');
					searchResult.description = feed.attr('description');
					searchResult.link = feed.attr('htmlUrl');
					searchResult.feedUrl = feed.attr('xmlUrl');
					searchResult.subscribed = false;

					mergeInResult(searchResult, searchResults);
				});

				callback('resultAvailable', searchResults);
			
			}).finally(function() {
				searchDigitalPodcastFinished = true;

				if(searchDigitalPodcastFinished && searchiTunesFinished) {
					callback('searchFinished');
				}
			});
			
			// Search with iTunes
			$http.get('https://itunes.apple.com/search', {
				params: {
					"media": "podcast",
					"term": searchTerms
				}
			}).then(function(response) {
				response.data.results.forEach(function(result) {
					var searchResult = new SearchResult;

					searchResult.title = result.collectionName;
					searchResult.itunesLink = result.collectionViewUrl;
					searchResult.feedUrl = result.feedUrl;
					searchResult.subscribed = false;
					searchResult.image = result.artworkUrl100;

					mergeInResult(searchResult, searchResults);
				});

				callback('resultAvailable', searchResults);
			}).finally(function() {
				searchiTunesFinished = true;

				if(searchDigitalPodcastFinished && searchiTunesFinished) {
					callback('searchFinished');
				}
			});
		}

		return service;
	}

})();