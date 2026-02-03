const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        validate: {
            len: [3, 50],
            notEmpty: true
        }
    },
    email: {
        type: DataTypes.STRING(255),
        allowNull: true,
        unique: true
    },
    passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    role: {
        type: DataTypes.ENUM('user', 'admin', 'courier'),
        defaultValue: 'user',
        allowNull: false
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false
    },
    lastLoginAt: {
        type: DataTypes.DATE,
        allowNull: true
    },
    lastLoginIp: {
        type: DataTypes.STRING(45),
        allowNull: true
    },
    divisionId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'ID подразделения из Fastopertor API для автообновления'
    },
    canModifySettings: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: 'Разрешено ли пользователю менять настройки своего профиля'
    }
}, {
    tableName: 'users',
    timestamps: true,
    hooks: {
        beforeCreate: async (user) => {
            if (user.passwordHash) {
                const salt = await bcrypt.genSalt(10);
                user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
            }
        },
        beforeUpdate: async (user) => {
            if (user.changed('passwordHash')) {
                const salt = await bcrypt.genSalt(10);
                user.passwordHash = await bcrypt.hash(user.passwordHash, salt);
            }
        }
    }
});

// Instance method to compare password
User.prototype.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.passwordHash);
};

// Instance method to remove sensitive data
User.prototype.toJSON = function () {
    const values = Object.assign({}, this.get());
    delete values.passwordHash;
    return values;
};

module.exports = User;
