const crypto = require('crypto')
const Sequelize = require('sequelize')
const db = require('../db')
const Cart = require('./cart')

const User = db.define('user', {
  firstName: {
    type: Sequelize.STRING
  },
  lastName: {
    type: Sequelize.STRING
  },
  email: {
    type: Sequelize.STRING,
    unique: true,
    allowNull: false
  },
  isAdmin: {
    type: Sequelize.BOOLEAN,
    defaultValue: false
  },
  password: {
    type: Sequelize.STRING,
    // Making `.password` act like a func hides it when serializing to JSON.
    // This is a hack to get around Sequelize's lack of a "private" option.
    get() {
      return () => this.getDataValue('password')
    }
  },
  salt: {
    type: Sequelize.STRING,
    // Making `.salt` act like a function hides it when serializing to JSON.
    // This is a hack to get around Sequelize's lack of a "private" option.
    get() {
      return () => this.getDataValue('salt')
    }
  },
  googleId: {
    type: Sequelize.STRING
  }
})

module.exports = User

/**
 * instanceMethods
 */

//add to cart finds product/user association or creats, and increments quantity by one
User.prototype.addToCart = async function(productId) {
  try {
    const [cart, wasCreated] = await Cart.findOrCreate({
      where: {
        userId: this.id,
        productId
      }
    })
    if (wasCreated) {
      cart.quantity = 1
    } else {
      cart.increment('quantity')
    }
    await cart.save()
  } catch (err) {
    console.log(err)
  }
}

//add to cart finds product/user association and decrements quantity by one
User.prototype.removeFromCart = async function(productId) {
  const cart = await Cart.findOne({
    where: {
      userId: this.id,
      productId: productId
    }
  })
  cart.quantity--
  //if cart quantity is now zero, destroy whole row
  cart.quantity === 0 ? await cart.destroy() : await cart.save()
}

User.prototype.getCart = async function() {
  const cart = await Cart.findAll({
    where: {
      userId: this.id,
      complete: false
    }
  })
  return cart
}

User.prototype.checkout = function() {
  const cart = this.getCart()
  cart.forEach(async order => {
    order.complete = true
    await order.save()
  })
}

User.prototype.getPrevOrders = async function() {
  const prevOrders = await Cart.findAll({
    where: {
      userId: this.id,
      complete: true
    }
  })
  return prevOrders
}

User.prototype.correctPassword = function(candidatePwd) {
  return User.encryptPassword(candidatePwd, this.salt()) === this.password()
}

/**
 * classMethods
 */
User.generateSalt = function() {
  return crypto.randomBytes(16).toString('base64')
}

User.encryptPassword = function(plainText, salt) {
  return crypto
    .createHash('RSA-SHA256')
    .update(plainText)
    .update(salt)
    .digest('hex')
}

/**
 * hooks
 */
const setSaltAndPassword = user => {
  if (user.changed('password')) {
    user.salt = User.generateSalt()
    user.password = User.encryptPassword(user.password(), user.salt())
  }
}

User.beforeCreate(setSaltAndPassword)
User.beforeUpdate(setSaltAndPassword)
User.beforeBulkCreate(users => {
  users.forEach(setSaltAndPassword)
})
