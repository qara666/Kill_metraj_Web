module.exports = (sequelize, DataTypes) => {
  const DashboardDivisionState = sequelize.define('DashboardDivisionState', {
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    division_id: {
      type: DataTypes.STRING,
      allowNull: false
    },
    date: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    data: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    last_updated: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'dashboard_division_states',
    timestamps: false
  });

  return DashboardDivisionState;
};
