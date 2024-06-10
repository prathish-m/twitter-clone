const express = require("express");
const path = require("path");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());

let dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeServerAndDatabase = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running on http://localhost:3000");
    });
  } catch (error) {
    console.log(`DB error message: '${error.message}'`);
  }
};

initializeServerAndDatabase();

const verifyToken = (request, response, next) => {
  let jwtToken;
  const authToken = request.headers["authorization"];
  if (authToken !== undefined) {
    jwtToken = authToken.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "NITISH", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API - ONE

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const createUserQuery = `INSERT INTO user(name, username, password, gender)
                            VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      const dbRespone = await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

// API - TWO

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === false) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "NITISH");
      response.send({ jwtToken });
    }
  }
});

// API - THREE

app.get("/user/tweets/feed/", verifyToken, async (request, response) => {
  let followers;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowingUsersQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
  const followingUsersArray = await db.all(getFollowingUsersQuery);
  followers = followingUsersArray.map(
    (eachFollower) => eachFollower.following_user_id
  );
  const getTweetsQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime 
      from user inner join tweet 
      on user.user_id= tweet.user_id where user.user_id in (${followers})
       order by tweet.date_time desc limit 4 ;`;
  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

// API - FOUR

app.get("/user/following/", verifyToken, async (request, response) => {
  let followers;
  const { username } = request;
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowingUserQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`;
  const followersArray = await db.all(getFollowingUserQuery);
  followers = followersArray.map(
    (eachFollower) => eachFollower.following_user_id
  );
  const getUserNames = `SELECT username as name FROM user WHERE user_id IN (${followers});`;
  const namesArray = await db.all(getUserNames);
  response.send(namesArray);
});

// API - FIVE

app.get("/user/followers/", verifyToken, async (request, response) => {
  let followers;
  const { username } = request;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  const getFollowersQuery = `select follower_user_id from follower where following_user_id = ${userId.user_id};`;
  const followersArray = await db.all(getFollowersQuery);
  followers = followersArray.map(
    (eachFollower) => eachFollower.follower_user_id
  );
  const getfolowersNamesQuery = `select name from user where user_id in (${followers});`;
  const namesArray = await db.all(getfolowersNamesQuery);
  response.send(namesArray);
});

// API - SIX

app.get("/tweets/:tweetId/", verifyToken, async (request, response) => {
  let followingUsers;
  let tweetIds;
  const { username } = request;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);

  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getUserFollowingUsersQuery = `select following_user_id from follower where follower_user_id = ${userId.user_id};`;
  const dbResponse = await db.all(getUserFollowingUsersQuery);
  followingUsers = dbResponse.map((eachUser) => eachUser.following_user_id);

  const getTweetIds = `select tweet_id from tweet where user_id IN (${followingUsers});`;
  const tweetIdsArray = await db.all(getTweetIds);
  tweetIds = tweetIdsArray.map((eachTweet) => eachTweet.tweet_id);

  if (tweetIds.includes(tweetId) === true) {
    const getTweetQuery = `select tweet.tweet, count(like.like_id) as likes, count(reply.reply_id) as replies, tweet.date_time as dateTime
                        from(tweet inner join like on tweet.tweet_id = like.tweet_id) as T
                        inner join reply on T.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId} group by tweet.tweet_id;`;
    const dbResponse = await db.get(getTweetQuery);
    response.send(dbResponse);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

// API - SEVEN

app.get("/tweets/:tweetId/likes/", verifyToken, async (request, response) => {
  let followingUsers;
  let tweetIds;
  const { username } = request;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);

  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getUserFollowingUsersQuery = `select following_user_id from follower where follower_user_id = ${userId.user_id};`;
  const dbResponse = await db.all(getUserFollowingUsersQuery);
  followingUsers = dbResponse.map((eachUser) => eachUser.following_user_id);

  const getTweetIds = `select tweet_id from tweet where user_id IN (${followingUsers});`;
  const tweetIdsArray = await db.all(getTweetIds);
  tweetIds = tweetIdsArray.map((eachTweet) => eachTweet.tweet_id);

  if (tweetIds.includes(tweetId) !== true) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getLikedUsersQuery = `select user.username from user inner join like 
                                    on user.user_id = like.user_id where like.tweet_id = ${tweetId};`;
    const dbResponse = await db.all(getLikedUsersQuery);
    let likesObject = null;
    const namesArray = dbResponse.map((eachLike) => eachLike.username);
    likesObject = {
      likes: namesArray,
    };
    response.send(likesObject);
  }
});

// API - EIGHT

app.get("/tweets/:tweetId/replies/", verifyToken, async (request, response) => {
  let followingUsers;
  let tweetIds;
  const { username } = request;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);

  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getUserFollowingUsersQuery = `select following_user_id from follower where follower_user_id = ${userId.user_id};`;
  const dbResponse = await db.all(getUserFollowingUsersQuery);
  followingUsers = dbResponse.map((eachUser) => eachUser.following_user_id);

  const getTweetIds = `select tweet_id from tweet where user_id IN (${followingUsers});`;
  const tweetIdsArray = await db.all(getTweetIds);
  tweetIds = tweetIdsArray.map((eachTweet) => eachTweet.tweet_id);

  if (tweetIds.includes(tweetId) !== true) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const getTweetQuery = `select tweet from tweet where user_id = ${userId.user_id};`;
    const tweetObject = await db.get(getTweetQuery);
    const getRepliesQuery = `select user.username as name,reply.reply  from user inner join reply
                                on reply.user_id = user.user_id where reply.tweet_id = ${tweetId};`;
    const dbResponse = await db.all(getRepliesQuery);
    const repliesObject = { , replies: dbResponse };
    response.send(repliesObject);
  }
});

// API - NINE

app.get("/user/tweets/", verifyToken, async (request, response) => {
  const { username } = request;

  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getTweetsQuery = `select tweet.tweet, count(like.like_id) as likes, count(reply.reply_id) as replies, tweet.date_time as dateTime
            from (tweet inner join like on tweet.tweet_id = like.tweet_id) as T inner join reply on T.tweet_id = reply.tweet_id where tweet.user_id = ${userId.user_id};`;

  const tweetsArray = await db.all(getTweetsQuery);
  response.send(tweetsArray);
});

// API - TEN

app.post("/user/tweets/", verifyToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  let currentDate = new Date().toISOString().split("T", 1)[0];

  const createTweetQuery = `INSERT INTO tweet(tweet, user_id, date_time) VALUES('${tweet}', ${userId.user_id}, ${currentDate});`;
  const dbResponse = await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API

app.delete("/tweets/:tweetId/", verifyToken, async (request, response) => {
  const { username } = request;
  let { tweetId } = request.params;
  tweetId = parseInt(tweetId);
  const getUserIdQuery = `select user_id from user where username = '${username}';`;
  const userId = await db.get(getUserIdQuery);

  const getTweetIdsQuery = `select tweet_id from tweet where user_id = ${userId.user_id};`;
  const tweetsArray = await db.all(getTweetIdsQuery);
  const userTweetIds = tweetsArray.map((eachObject) => eachObject.tweet_id);

  if (userTweetIds.includes(tweetId) === true) {
    const deleteQuery = `delete from tweet where tweet_id = ${tweetId};`;
    const dbResponse = await db.run(deleteQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
