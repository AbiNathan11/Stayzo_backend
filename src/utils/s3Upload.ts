import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3';
import { v4 as uuidv4 } from 'uuid';

export const uploadToS3 = async (fileString: string, folder: string): Promise<string> => {
  if (!fileString || !fileString.startsWith('data:image')) return fileString;
  try {
    const matches = fileString.match(/^data:(image\/\w+);base64,(.*)$/);
    if (!matches) return fileString;

    const [, mime, base64] = matches;
    const buffer = Buffer.from(base64, 'base64');
    const extension = mime.split('/')[1];
    const key = `${folder}/${uuidv4()}.${extension}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mime,
        // ACL intentionally omitted – bucket has ACLs disabled
      })
    );

    return `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    console.error('S3 upload error:', error);
    return fileString;
  }
};
