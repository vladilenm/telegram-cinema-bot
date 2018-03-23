const TelegramBot = require('node-telegram-bot-api')
const geolib = require('geolib')
const _ = require('lodash')
const mongoose = require('mongoose')
const config = require('./config')
const helper = require('./helpers')
const kb = require('./keyboard-buttons')
const keyboard = require('./keyboard')

const backendData = require('../database.json')

const ACTION_TYPE = {
  CINEMA_FILMS: 'cfs',
  FILM_CINEMAS: 'fcs',
  CINEMA_LOCATION: 'cl',
  FILM_TOGGLE_FAV: 'ftf'
}

helper.logStart()

mongoose.Promise = global.Promise

mongoose.connect(config.DB_URL, {
  useMongoClient: true
})
  .then(() => console.log('MongoDB connected'))
  .catch((err) => console.log(err))

// require models
require('./models/film.model')
require('./models/cinema.model')
require('./models/user.model')

const Film = mongoose.model('films')
const Cinema = mongoose.model('cinemas')
const User = mongoose.model('users')


// backendData.cinemas.forEach(c => new Cinema(c).save())
// backendData.films.forEach(f => new Film(f).save())

const bot = new TelegramBot(config.TOKEN, {
  polling: true
})

bot.on('message', msg => {

  console.log(msg.from.first_name, msg.text)

  const chatId = helper.getChatId(msg)

  switch (msg.text) {
    case kb.back:
      bot.sendMessage(chatId, `Что хотите посмотреть?`, {
        reply_markup: {keyboard: keyboard.home}
      })
      break
    case kb.home.films:
      bot.sendMessage(chatId, `Выберите жанр`, {
        reply_markup: {keyboard: keyboard.films}
      })
      break
    case kb.film.random:
      sendFilmsByQuery(chatId, {})
      break
    case kb.film.action:
      sendFilmsByQuery(chatId, {type: 'action'})
      break
    case kb.film.comedy:
      sendFilmsByQuery(chatId, {type: 'comedy'})
      break
    case kb.home.favourite:
      showFavouriteFilms(chatId, msg.from.id)
      break
    case kb.home.cinemas:
      bot.sendMessage(chatId, `Отправьте свое местоположение:`, {
        reply_markup: {
          keyboard: [
            [
              {
                text: 'Отправить местоположение',
                request_location: true
              }
            ],
            [kb.back]
          ]
        }
      })
      break
  }

  if (msg.location) {
    sendCinemasInCords(chatId, msg.location)
  }
})



// handler inline keyboard
bot.on('callback_query', query => {
  const userId = query.from.id

  let data
  try {
    data = JSON.parse(query.data)
  } catch (e) {
    throw new Error('Data is not a object')
  }

  const { type } = data

  if (type === ACTION_TYPE.CINEMA_LOCATION) {
    const { lat, lon } = data
    bot.sendLocation(query.message.chat.id, lat, lon)
  } else if (type === ACTION_TYPE.FILM_TOGGLE_FAV) {
    toggleFavouriteFilm(userId, query.id, data)
  } else if (type === ACTION_TYPE.CINEMA_FILMS) {
    sendFilmsByQuery(userId, {uuid: {'$in': data.filmUuids}})
  } else if (type === ACTION_TYPE.FILM_CINEMAS) {
    sendFilmCinemasByQuery(userId, {uuid: {'$in': data.cinemaUuids}})
  }
})

// start bot
bot.onText(/\/start/, msg => {
  const text = `Здравствуйте, ${msg.from.first_name}!\nЧто хотите посмотреть?`
  bot.sendMessage(helper.getChatId(msg), text, {
    reply_markup: {
      keyboard: keyboard.home
    }
  })
})

// find film by id
bot.onText(/\/f(.+)/, (msg, [source, match]) => {
  const filmUuid = helper.getItemUuid(source)

  Promise.all([Film.findOne({uuid: filmUuid}), User.findOne({telegramId: msg.from.id})])
  .then(([film, user]) => {

    let isFavourite = false

    if (user) {
      isFavourite = user.films.indexOf(film.uuid) !== -1
    }

    const favouriteText = isFavourite ? 'Удалить из избранного' : 'Добавить в избранное'

    bot.sendPhoto(msg.chat.id, film.picture, {
      caption: `Название: ${film.name}\nГод: ${film.year}\nРейтинг: ${film.rate}\nДлинна: ${film.length}\nСтрана: ${film.country}`,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: favouriteText,
              callback_data: JSON.stringify({
                type: ACTION_TYPE.FILM_TOGGLE_FAV,
                filmUuid: film.uuid,
                isFav: isFavourite
              })
            },
            {
              text: 'Показать кинотеатры',
              callback_data: JSON.stringify({
                type: ACTION_TYPE.FILM_CINEMAS,
                cinemaUuids: film.cinemas
              })
            }
          ],
          [
            {
              text: `Кинопоиск: ${film.name}`,
              url: film.link
            }
          ]
        ]
      }
    })
  }).catch(e => console.log(e))
})

// find cinema by id
bot.onText(/\/c(.+)/, (msg, [source, match]) => {
  const cinemaUuid = helper.getItemUuid(source)

  Cinema.findOne({uuid: cinemaUuid}).then(cinema => {
    bot.sendMessage(helper.getChatId(msg), `Перейти на сайт кинотеатра:`, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: cinema.name,
              url: cinema.url
            },
            {
              text: `Показать на карте`,
              callback_data: JSON.stringify({
                type: ACTION_TYPE.CINEMA_LOCATION,
                lat: cinema.location.latitude,
                lon: cinema.location.longitude,
              })
            }
          ],
          [
            {
              text: `Показать фильмы`,
              callback_data: JSON.stringify({
                type: ACTION_TYPE.CINEMA_FILMS,
                filmUuids: cinema.films
              })
            }
          ]
        ]
      }
    }).catch(err => console.log(err))
  })
})

// inline query bot from other chats
bot.on('inline_query', query => {
  console.log(query)
  Film.find({}).then(films => {
    const results = films.map(f => {
      return {
        id: f.uuid,
        type: 'photo',
        photo_url: f.picture,
        thumb_url: f.picture,
        caption: `Название: ${f.name}\nГод: ${f.year}\nРейтинг: ${f.rate}\nДлинна: ${f.length}\nСтрана: ${f.country}`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Кинопоиск: ${f.name}`,
                url: f.link
              }
            ]
          ]
        }
      }
    })

    bot.answerInlineQuery(query.id, results, {
      cache_time: 0
    })
  })
})

// find all films by type
function sendFilmsByQuery(chatId, query) {
  Film.find(query).then(films => {
    const html = films.map((f, i) => {
      return `<b>${i + 1}</b> ${f.name} - /f${f.uuid}`
    }).join('\n')

    sendHtml(chatId, html, 'films')
  })
}

// find cinemas with cords
function sendCinemasInCords(chatId, location) {

  Cinema.find({}).then(cinemas => {

    cinemas.forEach(c => {
      c.distance = geolib.getDistance(location, c.location) / 1000
    })

    cinemas = _.sortBy(cinemas, 'distance')

    const html = cinemas.map((c, i) => {
      return `<b>${i + 1}</b> ${c.name}. <em>Расстояние</em> - <strong>${c.distance}</strong> км. /c${c.uuid}`
    }).join('\n')

    sendHtml(chatId, html, 'home')
  })
}

// show favourite films
function showFavouriteFilms(chatId, telegramId) {
  User.findOne({telegramId})
    .then(user => {

      if (user) {
        Film.find({uuid: {'$in': user.films}}).then(films => {
          let html
          if (films.length) {
            html = films.map(f => {
              return `${f.name} - <b>${f.rate}</b> (/f${f.uuid})`
            }).join('\n')
            html = `<b>Ваши фильмы:</b>\n${html}`
          } else {
            html = 'Вы пока ничего не добавили'
          }

          sendHtml(chatId, html, 'home')
        })
      } else {
        sendHtml(chatId, 'Вы пока ничего не добавили', 'home')
      }
    }).catch(e => console.log(e))
}

// helper. send bot html
function sendHtml(chatId, html, keyboardName = null) {
  const options = {
    parse_mode: 'HTML'
  }

  if (keyboardName) {
    options['reply_markup'] = {
      keyboard: keyboard[keyboardName]
    }
  }

  bot.sendMessage(chatId, html, options)
}

// add or remove from favourite films
function toggleFavouriteFilm(userId, queryId, {filmUuid, isFav}) {
  let userPromise

  User.findOne({telegramId: userId})
  .then(user => {
    if (user) {
      if (isFav) {
        user.films = user.films.filter(fUuid => fUuid !== filmUuid)
      } else {
        user.films.push(filmUuid)
      }
      userPromise = user
    } else {
      userPromise = new User({
        telegramId: userId,
        films: [filmUuid]
      })
    }

    const answerText = isFav ? `Удалено из избранного` : `Фильм добавлен в избранное`

    userPromise.save()
    .then(_ => {
      bot.answerCallbackQuery({
        callback_query_id: queryId,
        text: answerText
      })
    })
    .catch(err => console.log(err))
  })
  .catch(err => console.log(err))
}

function sendFilmCinemasByQuery(userId, query) {
  Cinema.find(query).then(cinemas => {
    const html = cinemas.map((c, i) => {
      return `<b>${i + 1}</b> ${c.name} - /c${c.uuid}`
    }).join('\n')

    sendHtml(userId, html, 'home')
  })
}