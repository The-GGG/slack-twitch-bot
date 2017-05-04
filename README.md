# slack-twitch-bot

const bot = new TwitchBot(membersConnString, slackWebHook, twitchClientId);
bot
  .poll()
  .then(() {
    console.log("yah");
  });