const rp = require('request-promise');
const Members = require('members');
const SlackClient = require('slack-client');
const Promise = require('bluebird');

const GamingSlackChannelId = 'C23QJCUET';

module.exports = class TwitchBot {
  constructor(membersConnectionString, slackToken, twitchClientId) {
    this.membersClient = new Members(membersConnectionString);
    this.slackClient = new SlackClient(slackToken);
    this.twitchClientId = twitchClientId;
  }

  sendSlackMessage(message, twitchStream) {
    return this.slackClient
      .sendMessage(
        GamingSlackChannelId,
        message,
        [{
          title: twitchStream.channel.status,
          text: twitchStream.channel.url,
          image_url: twitchStream.preview.medium,
          thumb_url: twitchStream.preview.small
        }]);
  }

  sendSlackUpdate(message, messageId, twitchStream) {
    return this.slackClient.updateMessage(
      GamingSlackChannelId,
      messageId,
      message,
      [{
        title: twitchStream.channel.status,
        text: twitchStream.channel.url,
        image_url: twitchStream.preview.medium,
        thumb_url: twitchStream.preview.small
      }]);
  }

  *poll() {
    let twitchToMember = {};
    if (!this.members) {
      const response = yield this.membersClient.getMembers();
      this.members = response
        .filter(member => member.TwitchId && member.TwitchId.length > 0)
        .map(member => {
          member.isStreaming = false;
          member.slackMessageId = null;
          return member;
        })
      this.twitchIdToMember = this.members.reduce((acc, member) => {
          acc[member.TwitchId] = member;
          return acc;
        }, {});
    }

    const twitchIdCsv = this.members
      .map(member => member.TwitchId)
      .join(',');

    const twitchResponse = yield rp({
      method: 'GET',
      uri: `https://api.twitch.tv/kraken/streams?channel=${twitchIdCsv}`,
      headers: {
        'Client-ID': this.twitchClientId,
        'Accept': 'application/vnd.twitchtv.v5+json'
      },
      json: true,
    });

    if (!twitchResponse) {
      twitchResponse = {
        streams: []
      };
    } else if (!twitchResponse.streams) {
      twitchResponse.streams = [];
    }

    console.log(`${twitchResponse.streams.length} people are streaming`);

    return this.members.map(member => {
      const twitchStream = twitchResponse.streams.find(s => s.channel._id == member.TwitchId);

      if (twitchStream) {
        if (member.isStreaming) {
          return this.sendSlackUpdate(
            `<@${member.SlackId}> is streaming ${twitchStream.game}!   :twitch_live: LIVE`,
            member.slackMessageId,
            twitchStream);
        } else {
          member.isStreaming = true;
          member.stream = twitchStream;
          return this.sendSlackMessage(
              `<@${member.SlackId}> is streaming ${twitchStream.game}!   :twitch_live: LIVE`,
              twitchStream)
            .then(slackResponse => {
              member.slackMessageId = slackResponse.ts;
            });
        }
      } else {
        if (member.isStreaming) {
          member.isStreaming = false;
          return this.sendSlackUpdate(
            `<@${member.SlackId}> was streaming ${member.stream.game}.`,
            member.slackMessageId,
            member.stream);
        }
      }
      return Promise.resolve();
    });
  }
}
