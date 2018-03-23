const mongoose = require('mongoose')
const Schema = mongoose.Schema

const FilmSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  uuid: {
    type: String,
    required: true,
  },
  year: {
    type: Number
  },
  rate: {
    type: Number
  },
  length: {
    type: String
  },
  country: {
    type: String
  },
  link: {
    type: String
  },
  picture: {
    type: String
  },
  cinemas: {
    type: [String],
    default: []
  }
})

mongoose.model('films', FilmSchema)