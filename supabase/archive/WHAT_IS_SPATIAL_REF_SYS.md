# What is spatial_ref_sys?

## Overview

`spatial_ref_sys` is a **read-only reference table** that comes with the PostGIS extension. It contains the **EPSG (European Petroleum Survey Group) coordinate system definitions**.

## What It Contains

- **Coordinate System Definitions**: Information about different map projections and coordinate systems
- **EPSG Codes**: Standard numeric codes (like 4326 for WGS84, 3857 for Web Mercator)
- **Transformation Parameters**: Mathematical formulas for converting between coordinate systems
- **Reference Data Only**: This is **NOT user data** - it's like a dictionary or lookup table

## Why It Exists

When you use PostGIS functions like:
- `ST_Transform()` - Convert coordinates from one system to another
- `ST_SetSRID()` - Set the coordinate system of geometry
- Distance calculations across different projections

PostGIS needs to look up the coordinate system definitions from `spatial_ref_sys`.

## Example Use Cases

```sql
-- Convert coordinates from WGS84 (EPSG:4326) to Web Mercator (EPSG:3857)
SELECT ST_Transform(
    ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326),
    3857
);

-- PostGIS looks up EPSG:4326 and EPSG:3857 from spatial_ref_sys
-- to know how to perform the transformation
```

## Is It a Security Risk?

**NO.** Here's why:

1. **Read-Only**: Contains only reference data, no user information
2. **Public Knowledge**: EPSG codes are international standards, not secrets
3. **Cannot Be Modified**: Users can't insert/update/delete from it
4. **Already Secured**: We've revoked API access (see `spatial_ref_sys_workaround.sql`)
5. **Required for PostGIS**: Your location features need this table to function

## Why the Security Warning?

The Security Advisor checks if **every table** has RLS enabled. It doesn't know that:
- This is a system reference table
- It's read-only
- It's already secured via REVOKE
- It's required for PostGIS functionality

**This is a false positive.** The table is safe.

## Bottom Line

`spatial_ref_sys` is like a **phone book** or **dictionary** for coordinate systems. It's reference data that PostGIS needs to do its job. It's not a security risk, and you can safely dismiss the warning.

