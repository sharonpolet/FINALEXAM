import mongoose from "mongoose";

const sequenceSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  sequence: { type: Number, required: true, default: 0 }
});
export default mongoose.model("Sequence", sequenceSchema);
