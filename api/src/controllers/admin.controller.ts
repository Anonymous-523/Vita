import { Request, Response } from 'express';
import { Document, isValidObjectId } from 'mongoose';
import { AdminModel } from '../Models/Admins';
import { BannerModel } from '../Models/Banner';
import { MentorModel, UserModel } from '../Models/User';
import { sendEmail } from '../service/email-service';
import { MentorSchemaType, UserSchemaType } from '../types';
import { makeTemplate } from '../utils/makeTemplate';

const adminAuth = async (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(200).json({
      isLoggedIn: false,
      message: 'User is not logged in.',
      user: {
        name: '',
        image_link: '',
      },
      cookies: undefined,
    });
  }

  return res.status(200).json({
    isLoggedIn: true,
    message: 'User is logged in',
    user: req.user,
    cookies: req.cookies,
  });
};

const adminLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const admin = await AdminModel.findOne({ email });
  if (!admin) {
    return res.status(401).json({
      error: 'Invalid email or password',
    });
  }

  const isPasswordMatch = await admin.comparePassword(password);
  if (!isPasswordMatch) {
    return res.status(401).json({
      error: 'Invalid email or password',
    });
  }

  const otp = await admin.generateOTP();
  const template = makeTemplate('adminOtp.hbs', {
    otp,
  });
  const emailId = await sendEmail(admin.email, 'Vita Admin Login', template);
  return res.status(200).json({
    message: 'Email sent',
    emailId,
  });
};

const adminVerifyOtp = async (req: Request, res: Response) => {
  const { email, otp } = req.body;
  const admin = await AdminModel.findOne({ email });
  if (!admin) {
    return res.status(401).json({
      error: 'Invalid email or password',
    });
  }

  const isOtpMatch = await admin.verifyOTP(otp);
  if (!isOtpMatch) {
    return res.status(401).json({
      error: 'Invalid OTP',
    });
  }

  const token = admin.issueToken();

  res.cookie('adminToken', token, {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24 * 1,
  });

  return res.status(200).json({
    message: 'OTP verified',
    user: admin,
  });
};

/*
curl -X POST http://localhost:5000/api/admin/create --header 'Content-Type: application/json' \
--data-raw '{
    "name": "Rishabh Malhtora",
    "email": "rishabhmalhotraa01@gmail.com",
    "password": "password"
}'
*/

const createAdmin = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  const admin = new AdminModel({
    name,
    email,
    password,
  });

  await admin.save();

  return res.status(201).json({
    message: 'Admin Created Successfully',
  });
};

const adminLogout = async (req: Request, res: Response) => {
  res.clearCookie('adminToken');
  return res.json({
    success: true,
  });
};

const approveMentor = async (req: Request, res: Response) => {
  const { id } = req.body;

  let mentor: (Document & MentorSchemaType) | null = null;
  if (id && isValidObjectId(id)) mentor = await MentorModel.findById(id);

  if (!mentor) {
    return res.status(401).json({
      error: 'Mentor Not Found',
    });
  }

  mentor.approved = true;

  await mentor.save();

  try {
    await sendEmail(
      mentor.email,
      'Vita Application Approved!',
      makeTemplate('acceptMentor.hbs'),
    );
  } catch (err) {
    return res.status(500).json({
      message: "Email didn't sent",
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Mentor Approved!',
  });
};

const rejectMentor = async (req: Request, res: Response) => {
  const { id } = req.query;

  let user: (Document & UserSchemaType) | null = null;
  if (id && isValidObjectId(id)) user = await UserModel.findById(id);

  if (!user) {
    return res.status(404).json({
      message: "User didn't found!",
    });
  }

  await Promise.all([
    user.delete(),
    MentorModel.deleteOne({ _id: user.mentor_information }),
  ]);

  try {
    await sendEmail(
      user.email,
      'Vita Application rejected',
      makeTemplate('rejectMentor.hbs'),
    );
    return res.status(200).json({
      success: true,
      message: 'Mentor rejected successfully!',
    });
  } catch (err) {
    return res.status(500).json({
      message: "Email didn't sent",
    });
  }
};

const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  let user: (Document & UserSchemaType) | null = null;
  if (id && isValidObjectId(id)) user = await UserModel.findById(id);

  if (!user) {
    return res.status(404).json({
      error: 'User not found',
    });
  }

  await Promise.all([
    user.delete(),
    MentorModel.deleteOne({ _id: user.mentor_information }),
  ]);

  try {
    await sendEmail(
      user.email,
      'User account deleted',
      makeTemplate('accountDeleted.hbs', { email: user.email }),
    );
    return res.status(200).json({
      success: true,
      message: 'Mentor rejected successfully!',
    });
  } catch (err) {
    return res.status(500).json({
      message: "Email didn't sent",
    });
  }
};

const changeTopMentorStatus = async (req: Request, res: Response) => {
  const { id } = req.body;

  let mentor: (Document & MentorSchemaType) | null = null;
  if (id && isValidObjectId(id)) mentor = await MentorModel.findById(id);

  if (!mentor) {
    return res.status(401).json({
      error: 'Mentor Not Found',
    });
  }

  mentor.top_mentor = !mentor.top_mentor;

  await mentor.save();

  try {
    await sendEmail(
      mentor.email,
      'Vita top mentor',
      makeTemplate('topMentor.hbs', { top_mentor: mentor.top_mentor }),
    );
  } catch (err) {
    return res.status(500).json({
      message: "Email didn't sent",
    });
  }

  return res.status(200).json({
    success: true,
    message: 'Mentor Approved!',
  });
};

const modifyBanner = async (req: Request, res: Response) => {
  const deletePromise = BannerModel.deleteMany({});
  const createPromise = BannerModel.create(req.body);

  try {
    const [banner] = await Promise.all([createPromise, deletePromise]);

    return res.status(200).json({
      success: true,
      banner,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export default {
  adminAuth,
  adminLogin,
  adminVerifyOtp,
  createAdmin,
  adminLogout,
  modifyBanner,
  deleteUser,
  approveMentor,
  changeTopMentorStatus,
  rejectMentor,
};