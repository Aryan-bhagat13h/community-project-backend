import mongoose, { Schema } from "mongoose";

export const AUDIT_ACTIONS = [
  "assign_reviewer",
  "reassign_reviewer",
  "flag",
  "unflag",
  "remove",
  "restore",
];

const prototypeAuditLogSchema = new Schema(
  {
    prototype: { 
      type: Schema.Types.ObjectId, 
      ref: "Prototype", 
      required: true 
    },
    project: { 
      type: Schema.Types.ObjectId, 
      ref: "Project" 
    },

    prototypeTitle: { 
      type: String, 
      trim: true 
    },
    prototypeVersion: { 
      type: Number 
    },

    actor: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    action: { 
      type: String, 
      enum: AUDIT_ACTIONS, 
      required: true 
    },
    reason: { 
      type: String, 
      trim: true, 
      maxlength: 1000 
    },

    details: { 
      type: Schema.Types.Mixed 
    },

    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const immutable = function () {
  throw new Error("Audit log entries are immutable");
};
prototypeAuditLogSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate", "findOneAndDelete", "deleteOne", "deleteMany"],
  immutable
);
prototypeAuditLogSchema.pre("save", function () {
  if (!this.isNew) immutable();
});

prototypeAuditLogSchema.index({ prototype: 1, createdAt: -1 });
prototypeAuditLogSchema.index({ actor: 1, createdAt: -1 });
prototypeAuditLogSchema.index({ action: 1, createdAt: -1 });

export const PrototypeAuditLog = mongoose.model("PrototypeAuditLog", prototypeAuditLogSchema);