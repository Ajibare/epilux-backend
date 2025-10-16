// import mongoose from 'mongoose';
// const { Schema, model } = mongoose;

// const productSchema = new Schema({
//     name: {
//         type: String,
//         required: true,
//         trim: true
//     },
//     description: {
//         type: String,
//         required: true
//     },
//     price: {
//         type: Number,
//         required: true,
//         min: 0
//     },
//     sku: {
//         type: String,
//         unique: true,
//         sparse: true,
//         required: false
//     },
//     category: {
//         type: String,
//         required: true
//     },
//     brand: {
//         type: String,
//         required: false
//     },
//     images: [{
//         url: {
//             type: String,
//             required: true
//         },
//         publicId: String,
//         isPrimary: {
//             type: Boolean,
//             default: false
//         },
//         altText: String
//     }],
//     stock: {
//         type: Number,
//         required: true,
//         default: 0,
//         min: 0
//     },
//     isActive: {
//         type: Boolean,
//         default: true
//     },
//     isFeatured: {
//         type: Boolean,
//         default: false
//     },
//     isInStock: {
//         type: Boolean,
//         default: true
//     },
//     createdAt: {
//         type: Date,
//         default: Date.now
//     },
//     updatedAt: {
//         type: Date,
//         default: Date.now
//     }
// });

// // Update timestamp on update
// productSchema.pre('findOneAndUpdate', function(next) {
//     this.set({ updatedAt: Date.now() });
//     next();
// });

// export default model('Product', productSchema);



import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const productSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  sku: {
    type: String,
    unique: true,
    sparse: true,
    required: false
  },
  category: {
    type: String,
    required: true
  },
  brand: {
    type: String
  },
  images: [
    {
      url: {
        type: String,
        required: true
      },
      publicId: String,
      isPrimary: {
        type: Boolean,
        default: false
      },
      altText: String
    }
  ],
  primaryImage: {
    // 👈 Added field for quick frontend access
    type: String,
    default: null
  },
  stock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isInStock: {
    type: Boolean,
    default: true
  },
  discount: {
    type: Number,
    default: 0
  },
  specifications: {
    type: Object,
    default: {}
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Automatically set primaryImage field before saving
productSchema.pre('save', function (next) {
  if (this.images && this.images.length > 0) {
    const primary = this.images.find(img => img.isPrimary);
    this.primaryImage = primary ? primary.url : this.images[0].url;
  } else {
    this.primaryImage = null;
  }
  next();
});

// Update timestamp on update
productSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: Date.now() });
  next();
});

export default model('Product', productSchema);
