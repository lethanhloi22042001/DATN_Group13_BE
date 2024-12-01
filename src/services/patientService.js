require('dotenv').config();
import { Op } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import db from '../models/index';
import emailService from './emailService';
import doctorService from './doctorSevices';
import { formatDate } from '../utils';

let buildUrlEmail = (doctorId, token) => {
  let result = `${process.env.URL_REACT}/verify-booking?token=${token}&doctorId=${doctorId}`;
  return result;
};

let postBookAppointment = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (
        !data.email ||
        !data.doctorId ||
        !data.timeType ||
        !data.date ||
        !data.fullName ||
        !data.selectedGender ||
        !data.address
      ) {
        resolve({
          errCode: 1,
          errMessage: 'Missing parameter!',
        });
      } else {
        //Gửi Email xác thực
        let token = uuidv4();
        await emailService.sendSimpleEmail({
          reciverEmail: data.email,
          patientName: data.fullName,
          time: data.timeString,
          doctorName: data.doctorName,
          language: data.language,
          redirectLink: buildUrlEmail(data.doctorId, token),
        });

        let user = await db.User.findOrCreate({
          where: { email: data.email },
          defaults: {
            email: data.email,
            roleId: 'R3',
            gender: data.selectedGender,
            address: data.address,
            firstName: data.fullName,
          },
        });
        if (user && user[0]) {
          await db.Booking.findOrCreate({
            where: { patientId: user[0].id },
            defaults: {
              statusId: 'S1',
              doctorId: data.doctorId,
              patientId: user[0].id,
              date: data.date,
              timeType: data.timeType,
              token: token,
            },
          });
        }

        resolve({
          errCode: 0,
          errMessage: 'Save info patient succeed!',
        });
      }
    } catch (e) {
      reject(e);
    }
  });
};

let postVerifyBookAppointment = (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (!data.token || !data.doctorId) {
        resolve({
          errCode: 1,
          errMessage: 'Missing parameter!',
        });
      } else {
        let appointment = await db.Booking.findOne({
          where: {
            doctorId: data.doctorId,
            token: data.token,
            statusId: 'S1',
          },
          raw: false,
        });

        if (appointment) {
          appointment.statusId = 'S2';
          await appointment.save();
          resolve({
            errCode: 0,
            errMessage: 'Update appointment succeed!',
          });
        } else {
          resolve({
            errCode: 2,
            errMessage: 'Appointment has been activated or does not exist!',
          });
        }
      }
    } catch (e) {
      reject(e);
    }
  });
};

let resendBookingAppointment = () => {
  return new Promise(async (resolve, reject) => {
    try {
      const date = formatDate(new Date(new Date().getTime() + 24 * 60 * 60 * 1000));
      let data = await db.Booking.findAll({
        where: {
          createdAt: {
            [Op.lt]: `${date} 23:59:59`,
            [Op.gt]: `${date} 00:00:00`,
          },
        },
        include: [
          {
            model: db.User,
            as: 'patientData',
            attributes: ['email', 'firstName', 'address', 'gender'],
            include: [{ model: db.Allcode, as: 'genderData', attributes: ['valueEn', 'valueVi'] }],
          },
          {
            model: db.Allcode,
            as: 'timeTypeDataPatient',
            attributes: ['valueEn', 'valueVi'],
          },
        ],
        raw: false,
        nest: true,
      });
      if (data && data.length) {
        data.forEach(async (item) => {
          const doctor = await doctorService.getDetailDoctorById(item.doctorId);
          await emailService.resendEmailForPatient({
            email: item?.patientData?.email,
            patientName: item?.patientData?.firstName,
            time: `${item?.timeTypeDataPatient?.valueVi} - Ngày mai - ${date.replaceAll('-', '/')}`,
            doctorName: `${doctor?.data?.firstName} ${doctor?.data?.lastName}`,
            language: 'vi',
            status: item?.statusId,
            redirectLink: item?.statusId === 'S1' ? buildUrlEmail(item?.doctorId, item?.token) : '',
          });
        });
      }
    } catch (e) {
      reject(e);
    }
  });
};

module.exports = {
  postBookAppointment: postBookAppointment,
  postVerifyBookAppointment: postVerifyBookAppointment,
  resendBookingAppointment: resendBookingAppointment,
};
