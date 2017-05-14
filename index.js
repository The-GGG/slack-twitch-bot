const rp = require('request-promise');
const Members = require('members');
const SlackClient = require('slack-client');
const Promise = require('bluebird');

module.exports = class TwitchBot {
  constructor(membersConnectionString, slackToken, twitchClientId) {
    this.currentlyStreaming = [];
    this.members = new Members(membersConnectionString);
    this.slackClient = new SlackClient(slackToken);
    this.twitchClientId = twitchClientId;
  }

  poll() {
    let twitchToMember = {};
    console.log("getting members");
    return this.members
      .getMembers()
      .then(result => {
        console.log(`got ${result.count} members`);
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
        console.log(`getting status for users with twitch IDs ${result}`);
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
          console.log(`noone is streaming: ${result}`);
          return Promise.resolve();
        }

        console.log(`${result.streams.length} people are streaming`);
        const newStreamers = [];

        this.currentlyStreaming = result.streams.map(stream => {
          const id = stream.channel._id;

          if (!this.currentlyStreaming.includes(id)) {
            newStreamers.push(stream);
          }

          return id;
        });

        return Promise.all(newStreamers.map(stream => {
          const member = twitchToMember[stream.channel._id];

          return this.slackClient.sendMessage('C23QJCUET',
            `<@${member.SlackId}> started streaming ${stream.game}!`,
            [{
              title: stream.channel.status,
              text: stream.channel.url,
              image_url: stream.preview.medium,
              thumb_url: stream.preview.small
            }]);
        }));
      });
  }
}
