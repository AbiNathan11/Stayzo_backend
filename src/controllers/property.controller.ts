import { Request, Response } from 'express';
import { prisma } from '../config/db';
import cloudinary from '../config/cloudinary';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';
import {
  geocodeAddress,
  fetchNearbyAmenitiesForCoords,
  predictNoiseScore,
  predictNoiseScoreBasic,
  NoisePredictionInput,
} from '../services/noise.service';

// ── Cloudinary helper ─────────────────────────────────────────────────────────

const uploadToCloudinary = async (fileString: string, folder: string) => {
  if (!fileString || !fileString.startsWith('data:image')) return fileString;
  try {
    const res = await cloudinary.uploader.upload(fileString, { folder });
    return res.secure_url;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    return fileString;
  }
};

// ── Create Property ───────────────────────────────────────────────────────────

export const createProperty = async (req: Request, res: Response) => {
  try {
    const {
      ownerId, title, description, price,
      address, city, state, zipCode,
      bedrooms, bathrooms, sqft, type,
      images, panoramaImage, waterBillImage, amenities,
      latitude, longitude,
    } = req.body;

    if (!ownerId || !title || !price) {
      return res.status(400).json({ error: 'ownerId, title, and price are required' });
    }

    // Upload images to Cloudinary concurrently
    const uploadedPanorama = await uploadToCloudinary(panoramaImage, 'stayzo/panoramas');
    const uploadedWaterBill = await uploadToCloudinary(waterBillImage, 'stayzo/waterbills');

    let uploadedImages: string[] = [];
    if (images && Array.isArray(images) && images.length > 0) {
      uploadedImages = await Promise.all(
        images.map((img: string) => uploadToCloudinary(img, 'stayzo/properties'))
      );
    }

    // Use provided lat/lng or geocode address if not provided
    let lat: number | null = (latitude !== undefined && latitude !== null) ? parseFloat(latitude) : null;
    let lng: number | null = (longitude !== undefined && longitude !== null) ? parseFloat(longitude) : null;

    if (lat === null && lng === null && address) {
      const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');
      if (fullAddress.trim()) {
        try {
          const coords = await geocodeAddress(fullAddress);
          if (coords) { lat = coords.lat; lng = coords.lng; }
        } catch (err) {
          console.error('Geocoding failed during property creation:', err);
        }
      }
    }

    const property = await prisma.property.create({
      data: {
        ownerId,
        title,
        description: description || '',
        price: parseFloat(price),
        address: address || '',
        city,
        state,
        zipCode,
        bedrooms:  bedrooms  ? parseInt(bedrooms)     : 0,
        bathrooms: bathrooms ? parseFloat(bathrooms)  : 0,
        sqft:      sqft      ? parseFloat(sqft)       : 0,
        type:      type || 'Apartment',
        images: uploadedImages,
        panoramaImage: uploadedPanorama,
        waterBillImage: uploadedWaterBill,
        amenities: amenities || [],
        latitude:  lat,
        longitude: lng,
      },
    });

    res.status(201).json(property);
  } catch (error: any) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Failed to create property' });
  }
};

// Helper to lazily resolve and cache coordinates in DB if missing
async function ensurePropertyCoords(p: any) {
  const parsedLat = Number(p.latitude);
  const parsedLng = Number(p.longitude);
  const hasCoords = !isNaN(parsedLat) && parsedLat !== 0 && !isNaN(parsedLng) && parsedLng !== 0;
  if (hasCoords) {
    return { lat: parsedLat, lng: parsedLng };
  }

  const fullAddress = [p.address, p.city, p.state, p.zipCode].filter(Boolean).join(', ');
  if (!fullAddress.trim()) {
    return { lat: null, lng: null };
  }

  try {
    const coords = await geocodeAddress(fullAddress);
    if (coords) {
      await prisma.property.update({
        where: { id: p.id },
        data: { latitude: coords.lat, longitude: coords.lng },
      });
      return { lat: coords.lat, lng: coords.lng };
    }
  } catch (err) {
    console.error(`Failed to geocode address for property ${p.id}:`, err);
  }
  return { lat: null, lng: null };
}

// ── Get All Properties (with basic inline noise prediction) ───────────────────

export const getProperties = async (req: Request, res: Response) => {
  try {
    const properties = await prisma.property.findMany({
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Attach lightweight noise prediction (no API calls) for every listing
    const result = await Promise.all(properties.map(async (p) => {
      const coords = await ensurePropertyCoords(p);
      p.latitude = coords.lat;
      p.longitude = coords.lng;
      return {
        ...p,
        noisePrediction: predictNoiseScoreBasic({
          lat: p.latitude, lng: p.longitude, type: p.type, city: p.city,
        } as NoisePredictionInput),
      };
    }));

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error fetching properties:', error);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
};

// ── Search / Filter Properties ────────────────────────────────────────────────

export const searchProperties = async (req: Request, res: Response) => {
  try {
    const { district, type, budget } = req.query;

    const whereClause: any = {
      status: { equals: 'Available', mode: 'insensitive' },
    };

    if (district) whereClause.state = { equals: (district as string).trim(), mode: 'insensitive' };
    if (type)     whereClause.type  = { equals: type as string, mode: 'insensitive' };
    if (budget)   whereClause.price = { lte: parseFloat(budget as string) };

    const properties = await prisma.property.findMany({
      where: whereClause,
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = await Promise.all(properties.map(async (p) => {
      const coords = await ensurePropertyCoords(p);
      p.latitude = coords.lat;
      p.longitude = coords.lng;
      return {
        ...p,
        noisePrediction: predictNoiseScoreBasic({
          lat: p.latitude, lng: p.longitude, type: p.type, city: p.city,
        } as NoisePredictionInput),
      };
    }));

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error searching properties:', error);
    res.status(500).json({ error: 'Failed to search properties' });
  }
};

// ── Get Single Property (with full Places API noise prediction) ───────────────

export const getPropertyById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const property = await prisma.property.findUnique({
      where: { id },
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    if (!property) return res.status(404).json({ error: 'Property not found' });

    const coords = await ensurePropertyCoords(property);
    property.latitude = coords.lat;
    property.longitude = coords.lng;

    // Full noise prediction (uses Places API when lat/lng are available)
    const noisePrediction = await predictNoiseScore({
      lat: property.latitude,
      lng: property.longitude,
      type: property.type,
      city: property.city,
    } as NoisePredictionInput);

    res.status(200).json({ ...property, noisePrediction });
  } catch (error: any) {
    console.error('Error fetching property:', error);
    res.status(500).json({ error: 'Failed to fetch property' });
  }
};

// ── Get Properties by Owner ───────────────────────────────────────────────────

export const getPropertiesByOwner = async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  try {
    const { ownerId } = req.params;

    if (!ownerId) return res.status(400).json({ error: 'ownerId is required' });

    if (authReq.user?.id !== ownerId && !authReq.user?.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Access denied to these listings' });
    }

    const properties = await prisma.property.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });

    const result = await Promise.all(properties.map(async (p) => {
      const coords = await ensurePropertyCoords(p);
      p.latitude = coords.lat;
      p.longitude = coords.lng;
      return {
        ...p,
        noisePrediction: predictNoiseScoreBasic({
          lat: p.latitude, lng: p.longitude, type: p.type, city: p.city,
        } as NoisePredictionInput),
      };
    }));

    res.status(200).json(result);
  } catch (error: any) {
    console.error('Error fetching owner properties:', error);
    res.status(500).json({ error: 'Failed to fetch owner properties' });
  }
};

// ── Update Property ───────────────────────────────────────────────────────────

export const updateProperty = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title, description, price,
      address, city, state, zipCode,
      bedrooms, bathrooms, sqft, type,
      images, panoramaImage, waterBillImage, amenities, status,
    } = req.body;

    const existing = await prisma.property.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Property not found' });

    // Re-geocode if address components have changed
    const addressChanged =
      (address  !== undefined && address  !== existing.address)  ||
      (city     !== undefined && city     !== existing.city)     ||
      (state    !== undefined && state    !== existing.state)    ||
      (zipCode  !== undefined && zipCode  !== existing.zipCode);

    let lat = existing.latitude;
    let lng = existing.longitude;

    if (addressChanged) {
      const newAddress  = address  !== undefined ? address  : existing.address;
      const newCity     = city     !== undefined ? city     : existing.city;
      const newState    = state    !== undefined ? state    : existing.state;
      const newZipCode  = zipCode  !== undefined ? zipCode  : existing.zipCode;
      const fullAddress = [newAddress, newCity, newState, newZipCode].filter(Boolean).join(', ');

      if (fullAddress.trim()) {
        try {
          const coords = await geocodeAddress(fullAddress);
          lat = coords ? coords.lat : null;
          lng = coords ? coords.lng : null;
        } catch (err) {
          console.error('Geocoding failed during property update:', err);
          lat = null; lng = null;
        }
      } else {
        lat = null; lng = null;
      }
    }

    // Handle image uploads
    const uploadedPanorama  = panoramaImage  ? await uploadToCloudinary(panoramaImage,  'stayzo/panoramas')  : existing.panoramaImage;
    const uploadedWaterBill = waterBillImage ? await uploadToCloudinary(waterBillImage, 'stayzo/waterbills') : existing.waterBillImage;

    let uploadedImages: string[] = existing.images;
    if (images && Array.isArray(images) && images.length > 0) {
      uploadedImages = await Promise.all(
        images.map((img: string) => uploadToCloudinary(img, 'stayzo/properties'))
      );
    }

    const updated = await prisma.property.update({
      where: { id },
      data: {
        title:       title       !== undefined ? title                  : existing.title,
        description: description !== undefined ? description            : existing.description,
        price:       price       !== undefined ? parseFloat(price)      : existing.price,
        address:     address     !== undefined ? address                : existing.address,
        city:        city        !== undefined ? city                   : existing.city,
        state:       state       !== undefined ? state                  : existing.state,
        zipCode:     zipCode     !== undefined ? zipCode                : existing.zipCode,
        bedrooms:    bedrooms    !== undefined ? parseInt(bedrooms)     : existing.bedrooms,
        bathrooms:   bathrooms   !== undefined ? parseFloat(bathrooms)  : existing.bathrooms,
        sqft:        sqft        !== undefined ? parseFloat(sqft)       : existing.sqft,
        type:        type        !== undefined ? type                   : existing.type,
        status:      status      !== undefined ? status                 : existing.status,
        images:      uploadedImages,
        panoramaImage:  uploadedPanorama,
        waterBillImage: uploadedWaterBill,
        amenities:   amenities   !== undefined ? amenities              : existing.amenities,
        latitude:    lat,
        longitude:   lng,
      },
      include: {
        owner: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    // Attach live noise prediction to the response
    const noisePrediction = await predictNoiseScore({
      lat: updated.latitude, lng: updated.longitude,
      type: updated.type, city: updated.city,
    } as NoisePredictionInput);

    res.status(200).json({ ...updated, noisePrediction });
  } catch (error: any) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Failed to update property' });
  }
};

// ── GET Nearby Amenities (CORS proxy for frontend) ────────────────────────────

export const getNearbyAmenities = async (req: Request, res: Response) => {
  try {
    const { address, lat, lng } = req.query;

    let coords: { lat: number; lng: number } | null = null;

    if (lat && lng) {
      coords = { lat: parseFloat(lat as string), lng: parseFloat(lng as string) };
    } else if (address) {
      coords = await geocodeAddress(address as string);
    }

    if (!coords) {
      return res.status(400).json({ error: 'Invalid location parameters. Provide address or lat/lng.' });
    }

    const amenities = await fetchNearbyAmenitiesForCoords(coords.lat, coords.lng);

    res.status(200).json({ coords, amenities });
  } catch (error: any) {
    console.error('Error fetching nearby amenities:', error);
    res.status(500).json({ error: 'Failed to fetch nearby amenities' });
  }
};

export const togglePropertyStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const currentStatus = property.status;
    const newStatus = currentStatus === 'Disabled' ? 'Available' : 'Disabled';
    const updated = await prisma.property.update({
      where: { id },
      data: { status: newStatus }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Failed to toggle property status:', error);
    res.status(500).json({ error: 'Failed to toggle property status' });
  }
};

export const markPropertyAsBoosted = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const property = await prisma.property.findUnique({ where: { id } });
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    const updated = await prisma.property.update({
      where: { id },
      data: { isBoosted: true }
    });
    res.status(200).json(updated);
  } catch (error) {
    console.error('Failed to mark property as boosted:', error);
    res.status(500).json({ error: 'Failed to mark property as boosted' });
  }
};
