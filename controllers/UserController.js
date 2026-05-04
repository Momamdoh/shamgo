const asyncHandler = require('express-async-handler');
const { User, ValidateUserUpdate } = require('../models/User');

/**
 * @desc Get All Users
 * @route GET /api/users/admin
 * @access Private (only Admin)
 */
const AdmingetUserById = asyncHandler(async (req, res) => {
    const users = await User.find().select('-password');
    res.status(200).json(users);
});

/**
 * @desc Get User By Id
 * @route GET /api/users/:id/admin
 * @access Private (only Admin and User Himself)
 */
const AdmingetuserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');

    if (user) {
        res.status(200).json(user);
    } else {
        res.status(404).json({ message: 'User Not Found' });
    }
});

/**
 * @desc Edit User Details
 * @route PUT /api/users/:id
 * @access Private
 */
const AdminEditUserDetails = asyncHandler(async (req, res) => {
    const { error } = ValidateUserUpdate(req.body);

    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        {
            $set: {
                fname: req.body.fname,
                lname: req.body.lname,
                image: req.body.image,
            },
        },
        { new: true }
    ).select('-password');

    if (user) {
        res.status(200).json({
            status: 'success',
            message: 'User has been updated',
            user,
        });
    } else {
        res.status(404).json({ message: 'User not found' });
    }
});

/**
 * @desc Delete User
 * @route DELETE /api/users/:id/deleteadmin
 * @access Private (only Admin and User Himself)
 */
const AdmindeleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('-password');

    if (user) {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ status: 'success', message: 'User Has Been Deleted' });
    } else {
        res.status(404).json({ message: 'User Not Found' });
    }
});

module.exports = {
    AdmingetUserById,
    AdminEditUserDetails,
    AdmindeleteUser,
    AdmingetuserById,
};