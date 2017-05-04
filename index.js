const rp = require('request-promise');
const Members = require('members');
const SlackClient = require('slack-client');
const Promise = require('bluebird');

module.exports = class TwitchBot {
  let currentlyStreaming = [];

  constructor(membersConnectionString, slackWebHook, twitchClientId) {
    this.members = new Members(membersConnectionString);
    this.slackClient = new SlackClient(slackWebHook);
    this.twitchClientId = twitchClientId;
  }

  poll() {
    let twitchToMember = {};
    members
      .getMembers()
      .then(result => {
        const members = result
          .filter(member => member.TwitchId && member.TwitchId.length > 0);

        twitchToMember = members.reduce((acc, member) => {
          acc[member.TwitchId] = member;
          return acc;
        }, {});

        return members
          .map(member => member.TwitchId)
          .join(',');
      })
      .then(result => {
        return rp({
            method: 'GET',
            uri: `https://api.twitch.tv/kraken/streams?channel=${result}`,
            headers: {
              'Client-ID': this.twitchClientId,
              'Accept': 'application/vnd.twitchtv.v5+json'
            },
            json: true,
          });
      })
      .then(result => {
        if (!result || !result.streams || result.streams.length === 0) {
          return Promise.resolve();
        }

        const newStreamers = [];

        currentlyStreaming = result.streams.map(stream => {
          const id = stream.channel._id;

          if (!currentlyStreaming.includes(id)) {
            newStreamers.push(stream);
          }

          return id;
        });

        return Promise.all(newStreamers.map(stream => {
          const member = twitchToMember[stream.channel._id];

          return slackClient.sendMessage(
            `@${member.RowKey} started streaming ${stream.game}!`,
            [{
              title: stream.channel.url,
              image_url: stream.preview.medium,
              thumb_url: stream.preview.small
            }]);
        }));
      });
  }
}