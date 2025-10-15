// In authController.js
import User from '../models/User.js';

// Change password
export const changePassword = async (req, res) => {
  try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user.id;

      // Find user
      const user = await User.findById(userId).select('+password');
      if (!user) {
          return res.status(404).json({
              success: false,
              message: 'User not found'
          });
      }

      // Verify current password
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
          return res.status(400).json({
              success: false,
              message: 'Current password is incorrect'
          });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // Send confirmation email
    //   await sendEmail({
    //       to: user.email,
    //       subject: 'Password Changed',
    //       template: 'password-changed',
    //       context: {
    //           name: user.firstName
    //       }
    //   });

      res.json({
          success: true,
          message: 'Password updated successfully'
      });

  } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
          success: false,
          message: 'Error changing password',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
};

// Update profile
export const updateProfile = async (req, res) => {
  try {
      const { firstName, lastName, phone, address } = req.body;
      const userId = req.user.id;

      const updateData = {
          firstName,
          lastName,
          'profile.phone': phone,
          'profile.address': address
      };

      // Handle avatar upload if exists
      if (req.file) {
          const result = await cloudinary.uploader.upload(req.file.path, {
              folder: 'avatars',
              width: 150,
              crop: "scale"
          });
          updateData.avatar = {
              public_id: result.public_id,
              url: result.secure_url
          };
      }

      const user = await User.findByIdAndUpdate(
          userId,
          { $set: updateData },
          { new: true, runValidators: true }
      ).select('-password');

      res.json({
          success: true,
          message: 'Profile updated successfully',
          data: {
              id: user._id,
              firstName: user.firstName,
              lastName: user.lastName,
              email: user.email,
              avatar: user.avatar,
              phone: user.profile?.phone,
              address: user.profile?.address
          }
      });

  } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
          success: false,
          message: 'Error updating profile',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
  }
};