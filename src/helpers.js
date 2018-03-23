module.exports = {
  debug(obj) {
    return JSON.stringify(obj, null, 4)
  },

  logStart() {
    console.clear()
    console.log('Bot has been started ...')
  },

  getChatId(message) {
    return message.chat.id
  },

  getItemUuid(source) {
    return source.substr(2, source.length)
  }
}